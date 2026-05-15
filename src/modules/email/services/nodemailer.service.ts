import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as handlebars from 'handlebars';
// import { SettingFeatureService } from '@modules/setting/services/setting-feature.service';
import path from 'path';
import { EmailTemplateContext } from '../templates/context';
import { MessageLogService } from '@modules/message-log/services/message-log.service';
import { ENUM_MESSAGE_LOG_CHANNEL, ENUM_MESSAGE_LOG_STATUS } from '@modules/message-log/enums/message-log.enum';

export interface CompanySmtpConfig {
    smtp_enabled: boolean;
    smtp_host: string;
    smtp_port: number;
    smtp_username: string;
    smtp_password: string;
    smtp_from_email: string;
    smtp_from_name: string;
    smtp_secure: boolean;
}

@Injectable()
export class NodemailerService {
    private readonly logger = new Logger(NodemailerService.name);

    constructor(private readonly messageLogService: MessageLogService) {}

    /**
     * Safely call a message-log method. Logging is observability and must NEVER
     * block or fail an email send. This wraps every log call so that if the
     * message-log service is broken (DI failure, missing table, DB latency,
     * etc.) the email still goes out. The result is returned so callers can
     * still thread the log id through, but any error is swallowed with a warn.
     */
    private async safeLog<T>(fn: () => Promise<T>): Promise<T | undefined> {
        if (!this.messageLogService) return undefined;
        try {
            return await fn();
        } catch (err: any) {
            this.logger.warn(`Message log call failed (non-fatal): ${err?.message}`);
            return undefined;
        }
    }

    /**
     * Check if emails should be sent based on environment
     * Emails are only sent in production unless EMAIL_ENABLED=true is explicitly set
     */
    private shouldSendEmail(): boolean {
        // If EMAIL_ENABLED is explicitly set, use that value
        const emailEnabled = process.env.EMAIL_ENABLED;
        if (emailEnabled !== undefined) {
            return emailEnabled === 'true';
        }

        // Otherwise, check APP_ENV - only send in production
        const appEnv = process.env.APP_ENV?.toLowerCase() || 'local';
        return appEnv === 'production';
    }

    /**
     * Determine if secure connection should be used based on port
     * Port 465: SSL (secure=true)
     * Port 587: STARTTLS (secure=false, but TLS is still used via STARTTLS)
     * Port 25: No encryption (secure=false)
     */
    private getSecureSetting(): boolean {
        // If explicitly set in env, use that value
        const smtpSecure = process.env.SMTP_SECURE;
        if (smtpSecure !== undefined && smtpSecure !== '') {
            return smtpSecure === 'true';
        }

        // Auto-determine based on port
        const port = parseInt(process.env.SMTP_PORT || '587');
        // Port 465 uses implicit SSL/TLS
        // Port 587 and 25 use STARTTLS (secure=false, but STARTTLS upgrades to TLS)
        return port === 465;
    }

    /**
     * Create nodemailer transporter with proper settings (env vars)
     */
    private createTransporter() {
        const port = parseInt(process.env.SMTP_PORT || '587');
        const secure = this.getSecureSetting();

        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: port,
            secure: secure,
            auth: {
                user: process.env.SMTP_USERNAME,
                pass: process.env.SMTP_PASSWORD,
            },
            // For port 587, enable STARTTLS
            ...(port === 587 && !secure ? { requireTLS: true } : {}),
        });
    }

    /**
     * Create nodemailer transporter from company-level SMTP config
     */
    private createTransporterFromConfig(config: CompanySmtpConfig) {
        const port = config.smtp_port || 587;
        const secure = config.smtp_secure ?? (port === 465);

        return nodemailer.createTransport({
            host: config.smtp_host,
            port: port,
            secure: secure,
            auth: {
                user: config.smtp_username,
                pass: config.smtp_password,
            },
            ...(port === 587 && !secure ? { requireTLS: true } : {}),
        });
    }

    /**
     * Resolve the transporter and from address.
     * If a company SMTP config is provided and enabled, use it; otherwise fallback to env vars.
     */
    private resolveTransport(companySmtpConfig?: CompanySmtpConfig, fromOverride?: string) {
        if (companySmtpConfig && companySmtpConfig.smtp_enabled && companySmtpConfig.smtp_host) {
            const transporter = this.createTransporterFromConfig(companySmtpConfig);
            const fromName = companySmtpConfig.smtp_from_name || 'ShivaTrade';
            const fromEmail = companySmtpConfig.smtp_from_email || companySmtpConfig.smtp_username;
            const fromAddress = fromOverride || `${fromName} <${fromEmail}>`;
            return { transporter, fromAddress, isCompanySmtp: true };
        }

        // Fallback: env-level check
        if (!this.shouldSendEmail()) {
            return { transporter: null, fromAddress: '', isCompanySmtp: false };
        }

        const transporter = this.createTransporter();
        const fromName = process.env.SMTP_NAME || 'ShivaTrade';
        const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USERNAME;
        const fromAddress = fromOverride || `${fromName} <${fromEmail}>`;
        return { transporter, fromAddress, isCompanySmtp: false };
    }

    async sendEmail(
        to: string,
        subject: string,
        text: string,
        from?: string,
        attachments?: any[],
        html?: string,
        companySmtpConfig?: CompanySmtpConfig
    ) {
        const { transporter, fromAddress, isCompanySmtp } = this.resolveTransport(companySmtpConfig, from);

        // Create pending log entry — safeLog ensures DI / DB failures never
        // block the actual email send.
        const log = await this.safeLog(() => this.messageLogService.createPending({
            channel: ENUM_MESSAGE_LOG_CHANNEL.EMAIL,
            recipient_address: to,
            subject,
            body: html || text,
            provider: isCompanySmtp ? 'nodemailer-company' : 'nodemailer',
        }));

        if (!transporter) {
            this.logger.log(`📧 [SKIPPED] Email not sent (APP_ENV=${process.env.APP_ENV}): To: ${to}, Subject: ${subject}`);
            await this.safeLog(() => this.messageLogService.markSkipped(log?._id, `Email disabled (APP_ENV=${process.env.APP_ENV})`));
            return { messageId: 'skipped-dev-mode', accepted: [to] };
        }

        const mailOptions = {
            from: fromAddress,
            to,
            subject,
            text,
            html,
            attachments,
        };

        try {
            this.logger.log(`📧 Sending email to: ${to}, Subject: ${subject}${isCompanySmtp ? ' (company SMTP)' : ''}`);
            const result = await transporter.sendMail(mailOptions);
            this.logger.log(`📧 Email sent successfully: ${result.messageId}`);
            await this.safeLog(() => this.messageLogService.markSent(log?._id, result.messageId));
            return result;
        } catch (error) {
            this.logger.error(`📧 Failed to send email to ${to}: ${error.message}`);
            if (isCompanySmtp) {
                this.logger.error(`📧 Company SMTP Config: host=${companySmtpConfig.smtp_host}, port=${companySmtpConfig.smtp_port}`);
            } else {
                this.logger.error(`📧 SMTP Config: host=${process.env.SMTP_HOST}, port=${process.env.SMTP_PORT}, secure=${this.getSecureSetting()}, user=${process.env.SMTP_USERNAME}`);
            }
            await this.safeLog(() => this.messageLogService.markFailed(log?._id, error.message));
            throw error;
        }
    }

    async sendEmailWithTemplate(
        to: string,
        subject: string,
        template: string,
        context: any,
        bcc: string[]=[],
        attachments?: any[],
        from?: string,
        companySmtpConfig?: CompanySmtpConfig
    ) {
        try {
            // Use __dirname for reliable path resolution in both dev (src/) and prod (dist/)
            const completePath = path.resolve(__dirname, '..', 'templates', template);

            if (!fs.existsSync(completePath)) {
                throw new Error(`Template file not found: ${completePath}`);
            }
            const logo = context.logo || process.env.FRONT_LOGO_URL || '';
            const frontUrl = context.frontUrl || process.env.MAIN_URL || 'https://app.shivatrade.com';
            const supportEmail = context.supportEmail || process.env.SMTP_SUPPORT_EMAIL || process.env.SMTP_FROM || 'support@shivatrade.com';
            const homeName = context.homeName || process.env.HOME_NAME || 'ShivaTrade';
            const homeUrl = context.homeUrl || process.env.HOME_URL || frontUrl;
            const contextData = {
                ...context,
                logo,
                frontUrl,
                supportEmail,
                homeName,
                homeUrl,
            };
            const templateFile = fs.readFileSync(completePath, 'utf8');
            const compiledTemplate = handlebars.compile(templateFile);
            let html = compiledTemplate(contextData);

            // Wrap notification templates with branded layout
            // Only wrap templates in the notifications/ directory — system templates (.hjs, signup_otp.hbs) have their own layout
            if (template.includes('notifications/')) {
                html = this.wrapWithBrandedLayout(html, {
                    logo,
                    companyDisplayName: context.companyDisplayName || '',
                    footerAddress: context.footerAddress || '',
                    footerContact: context.footerContact || '',
                    footerExtra: context.footerExtra || '',
                    frontUrl,
                });
            }

            // Send as HTML email instead of text
            return this.sendEmailWithHtml(to, subject, html, from, bcc, attachments, companySmtpConfig);
        } catch (error) {
            console.error('Error sending email with template:', error);
            throw error;
        }
    }

    /**
     * Wraps email body content with a branded header bar + footer.
     * Table-based layout for maximum email client compatibility.
     */
    private wrapWithBrandedLayout(bodyHtml: string, branding: {
        logo: string;
        companyDisplayName: string;
        footerAddress: string;
        footerContact: string;
        footerExtra: string;
        frontUrl: string;
    }): string {
        // Extract inner body content (strip <html>, <body> tags if present)
        let content = bodyHtml;
        const bodyMatch = bodyHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (bodyMatch) content = bodyMatch[1];
        // Also strip the old logo block from the content (templates still have it)
        content = content.replace(/<div[^>]*style="text-align:\s*center[^"]*"[^>]*>\s*<img[^>]*alt="Logo"[^>]*\/?\s*>\s*<\/div>/gi, '');
        // Remove {{#if logo}}...{{/if}} leftover (already compiled, may be empty)
        content = content.replace(/<!--\s*logo\s*-->/gi, '');

        const displayName = branding.companyDisplayName || '';

        // Build logo cell
        const logoCell = branding.logo
            ? `<img src="${branding.logo}" alt="${displayName || 'Logo'}" style="max-height:40px;vertical-align:middle;" />`
            : '';

        // Build company name cell
        const nameCell = displayName
            ? `<span style="color:#ffffff;font-size:16px;font-weight:600;font-family:Arial,sans-serif;">${displayName}</span>`
            : '';

        // Build footer parts
        const footerParts = [
            branding.footerAddress,
            branding.footerContact,
            branding.footerExtra,
        ].filter(Boolean);
        const footerText = footerParts.length > 0
            ? footerParts.join(' &nbsp;|&nbsp; ')
            : '';

        return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
    <tr><td align="center" style="padding:20px 10px 0;">

      <!-- Email Container -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header Bar -->
        <tr>
          <td style="background-color:#09418B;border-radius:8px 8px 0 0;padding:16px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="text-align:left;vertical-align:middle;width:50%;">${logoCell}</td>
                <td style="text-align:right;vertical-align:middle;width:50%;">${nameCell}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Content Area -->
        <tr>
          <td style="background-color:#ffffff;padding:24px 24px 16px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 24px;border:1px solid #e5e7eb;border-top:none;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${footerText ? `<tr><td style="text-align:center;font-size:11px;color:#6b7280;padding-bottom:8px;">${footerText}</td></tr>` : ''}
              <tr><td style="text-align:center;font-size:11px;color:#9ca3af;">
                This is an automated notification. Please do not reply to this email.
              </td></tr>
              ${branding.frontUrl ? `<tr><td style="text-align:center;padding-top:8px;"><a href="${branding.frontUrl}" style="font-size:11px;color:#09418B;text-decoration:none;">Open ShivaTrade</a></td></tr>` : ''}
            </table>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`;
    }

    async sendEmailWithHtml(
        to: string,
        subject: string,
        html: string,
        from?: string,
        bcc?: string[],
        attachments?: any[],
        companySmtpConfig?: CompanySmtpConfig
    ) {
        const { transporter, fromAddress, isCompanySmtp } = this.resolveTransport(companySmtpConfig, from);

        const log = await this.safeLog(() => this.messageLogService.createPending({
            channel: ENUM_MESSAGE_LOG_CHANNEL.EMAIL,
            recipient_address: to,
            subject,
            body: html,
            provider: isCompanySmtp ? 'nodemailer-company' : 'nodemailer',
        }));

        if (!transporter) {
            this.logger.log(`📧 [SKIPPED] Email not sent (APP_ENV=${process.env.APP_ENV}): To: ${to}, Subject: ${subject}`);
            await this.safeLog(() => this.messageLogService.markSkipped(log?._id, `Email disabled (APP_ENV=${process.env.APP_ENV})`));
            return { messageId: 'skipped-dev-mode', accepted: [to] };
        }

        const mailOptions = {
            from: fromAddress,
            to,
            subject,
            html,
            bcc,
            attachments,
        };

        try {
            this.logger.log(`📧 Sending HTML email to: ${to}, Subject: ${subject}${isCompanySmtp ? ' (company SMTP)' : ''}`);
            const result = await transporter.sendMail(mailOptions);
            this.logger.log(`📧 Email sent successfully: ${result.messageId}`);
            await this.safeLog(() => this.messageLogService.markSent(log?._id, result.messageId));
            return result;
        } catch (error) {
            this.logger.error(`📧 Failed to send email to ${to}: ${error.message}`);
            if (isCompanySmtp) {
                this.logger.error(`📧 Company SMTP Config: host=${companySmtpConfig.smtp_host}, port=${companySmtpConfig.smtp_port}`);
            } else {
                this.logger.error(`📧 SMTP Config: host=${process.env.SMTP_HOST}, port=${process.env.SMTP_PORT}, user=${process.env.SMTP_USERNAME}`);
            }
            await this.safeLog(() => this.messageLogService.markFailed(log?._id, error.message));
            throw error;
        }
    }
}
