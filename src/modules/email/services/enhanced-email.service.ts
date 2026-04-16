import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IEmailService } from '@modules/email/interfaces/email.service.interface';
import { EmailSendDto } from '@modules/email/dtos/email.send.dto';
import { EmailTempPasswordDto } from '@modules/email/dtos/email.temp-password.dto';
import { EmailResetPasswordDto } from '@modules/email/dtos/email.reset-password.dto';
import { EmailCreateDto } from '@modules/email/dtos/email.create.dto';
import { EmailVerificationDto } from '@modules/email/dtos/email.verification.dto';
import { EmailVerifiedDto } from '@modules/email/dtos/email.verified.dto';
import { EmailMobileNumberVerifiedDto } from '@modules/email/dtos/email.mobile-number-verified.dto';
import { AzureEmailService } from './azure-email.service';
import { NodemailerService, CompanySmtpConfig } from './nodemailer.service';
import { SettingFeatureService } from '@modules/setting/services/setting-feature.service';
import { HelperDateService } from '@common/helper/services/helper.date.service';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import fs from "fs";
import path from "path";
import { AssessmentEmailVerificationDto } from '../dtos/email.assessment-verification.dto';

export enum EmailProvider {
    NODEMAILER = 'nodemailer',
    AZURE = 'azure',
}

// Currency symbol mapping
const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$',
    GBP: '£',
    EUR: '€',
    INR: '₹',
    JPY: '¥',
    CNY: '¥',
    AUD: 'A$',
    CAD: 'C$',
    CHF: 'CHF',
    NZD: 'NZ$',
    SGD: 'S$',
    HKD: 'HK$',
    KRW: '₩',
    MXN: 'MX$',
    BRL: 'R$',
    ZAR: 'R',
    SEK: 'kr',
    NOK: 'kr',
    DKK: 'kr',
    PLN: 'zł',
    THB: '฿',
    MYR: 'RM',
    PHP: '₱',
    IDR: 'Rp',
    AED: 'د.إ',
    SAR: '﷼',
};

@Injectable()
export class EnhancedEmailService implements IEmailService {
    private readonly logger = new Logger(EnhancedEmailService.name);
    private readonly fromEmail: string;
    private readonly supportEmail: string;
    private readonly homeName: string;
    private readonly homeUrl: string;
    private readonly currencySymbol: string;

    constructor(
        private readonly helperDateService: HelperDateService,
        private readonly configService: ConfigService,
        private readonly azureEmailService: AzureEmailService,
        private readonly nodemailerService: NodemailerService,
        private readonly companySettingsService: CompanySettingsService,
    ) {
        this.fromEmail = this.configService.get<string>('email.fromEmail');
        this.supportEmail = this.configService.get<string>('email.supportEmail');
        this.homeName = this.configService.get<string>('home.name');
        this.homeUrl = this.configService.get<string>('home.url');
        // Get currency symbol from stripe config
        const currencyCode = this.configService.get<string>('stripe.currency') || 'USD';
        this.currencySymbol = CURRENCY_SYMBOLS[currencyCode.toUpperCase()] || '$';
    }

    /**
     * Get the preferred email provider from settings
     */
    private async getEmailProvider(): Promise<EmailProvider> {
        try {
            const provider = process.env.EMAIL_PROVIDER;

            return Object.values(EmailProvider).includes(provider as EmailProvider)
                ? provider as EmailProvider
                : EmailProvider.NODEMAILER;
        } catch (error) {
            this.logger.warn('Failed to get email provider setting, using nodemailer as default');
            return EmailProvider.NODEMAILER;
        }
    }

    /**
     * Resolve company SMTP config from companyId/locationId
     */
    private async resolveCompanySmtpConfig(companyId?: string, locationId?: string): Promise<CompanySmtpConfig | undefined> {
        if (!companyId) return undefined;
        try {
            // 1. Check location-level SMTP settings first
            if (locationId) {
                const locSettings = await this.companySettingsService.getOrCreate(companyId, locationId);
                const locMapped = this.companySettingsService.mapGet(locSettings);
                if (locMapped.smtp_enabled && locMapped.smtp_host && !(locSettings as any).is_inherited) {
                    return {
                        smtp_enabled: locMapped.smtp_enabled,
                        smtp_host: locMapped.smtp_host,
                        smtp_port: locMapped.smtp_port,
                        smtp_username: locMapped.smtp_username,
                        smtp_password: locMapped.smtp_password,
                        smtp_from_email: locMapped.smtp_from_email,
                        smtp_from_name: locMapped.smtp_from_name,
                        smtp_secure: locMapped.smtp_secure,
                    };
                }
            }

            // 2. Fallback to company-level SMTP settings
            const companySettings = await this.companySettingsService.getCompanyDefaults(companyId);
            const companyMapped = this.companySettingsService.mapGet(companySettings);
            if (companyMapped.smtp_enabled && companyMapped.smtp_host) {
                return {
                    smtp_enabled: companyMapped.smtp_enabled,
                    smtp_host: companyMapped.smtp_host,
                    smtp_port: companyMapped.smtp_port,
                    smtp_username: companyMapped.smtp_username,
                    smtp_password: companyMapped.smtp_password,
                    smtp_from_email: companyMapped.smtp_from_email,
                    smtp_from_name: companyMapped.smtp_from_name,
                    smtp_secure: companyMapped.smtp_secure,
                };
            }

            // 3. No company SMTP → returns undefined → NodemailerService falls back to ENV SMTP
        } catch (error) {
            this.logger.warn(`Failed to resolve company SMTP config for company ${companyId}: ${error.message}`);
        }
        return undefined;
    }

    /**
     * Resolve company branding (logo, display name, footer) from company settings.
     * Returns null for system-level emails (no companyId).
     */
    private async resolveCompanyBranding(companyId?: string): Promise<{
        logo: string;
        logoFilePath?: string;
        companyDisplayName: string;
        footerAddress: string;
        footerContact: string;
        footerExtra: string;
    } | null> {
        if (!companyId) return null;
        try {
            const settings = await this.companySettingsService.getCompanyDefaults(companyId);
            const mapped = this.companySettingsService.mapGet(settings);

            let logoUrl = '';
            let logoFilePath: string | undefined;
            if (mapped.logo_url) {
                if (mapped.logo_url.startsWith('http')) {
                    logoUrl = mapped.logo_url;
                } else {
                    // Use CID reference — the actual file attachment is handled by nodemailer
                    const relativePath = mapped.logo_url.replace(/^\/assets\//, '');
                    const resolvedPath = path.join(process.cwd(), 'public', relativePath);
                    if (fs.existsSync(resolvedPath)) {
                        logoUrl = `cid:company-logo`;
                        logoFilePath = resolvedPath;
                    }
                }
            }

            return {
                logo: logoUrl,
                logoFilePath,
                companyDisplayName: mapped.company_display_name || '',
                footerAddress: mapped.footer_address || '',
                footerContact: mapped.footer_contact || '',
                footerExtra: mapped.footer_extra || '',
            };
        } catch (error) {
            this.logger.warn(`Failed to resolve company branding for ${companyId}: ${error.message}`);
            return null;
        }
    }

    /** Build backend base URL for resolving relative asset paths */
    private getBackendUrl(): string {
        const host = this.configService.get<string>('app.http.host') || 'localhost';
        const port = this.configService.get<number>('app.http.port') || 3001;
        return host === '0.0.0.0' ? `http://localhost:${port}` : `http://${host}:${port}`;
    }

    /**
     * Send email using the configured provider
     */
    async sendEmailWithProvider(
        to: string,
        name: string,
        subject: string,
        templateFile: string,
        templateData: any,
        bcc: string[] = [],
        filePath?: string,
        companySmtpConfig?: CompanySmtpConfig,
        companyId?: string,
        locationId?: string,
    ): Promise<boolean> {
        try {
            // Resolve company SMTP config if companyId provided and no explicit config
            let smtpConfig = companySmtpConfig;
            if (!smtpConfig && companyId) {
                smtpConfig = await this.resolveCompanySmtpConfig(companyId, locationId);
            }

            // Inject company branding into template data for company-level emails
            let logoAttachment: any = undefined;
            if (companyId && !templateData.logo) {
                const branding = await this.resolveCompanyBranding(companyId);
                if (branding?.logo) {
                    templateData.logo = branding.logo;
                }
                // If CID logo, create inline attachment for nodemailer
                if (branding?.logoFilePath) {
                    logoAttachment = {
                        filename: path.basename(branding.logoFilePath),
                        path: branding.logoFilePath,
                        cid: 'company-logo',
                    };
                }
                if (branding?.companyDisplayName) {
                    templateData.companyDisplayName = branding.companyDisplayName;
                }
                if (branding?.footerAddress) {
                    templateData.footerAddress = branding.footerAddress;
                }
                if (branding?.footerContact) {
                    templateData.footerContact = branding.footerContact;
                }
                if (branding?.footerExtra) {
                    templateData.footerExtra = branding.footerExtra;
                }
            }

            const provider = await this.getEmailProvider();

            switch (provider) {
                case EmailProvider.AZURE:
                    return await this.azureEmailService.sendEmailWithTemplate(
                        to,
                        name,
                        subject,
                        templateFile,
                        templateData,
                        filePath,
                        null,
                        bcc[0],
                    );

                case EmailProvider.NODEMAILER:
                default: {
                    const allAttachments = [
                        ...(filePath ? [{ path: filePath }] : []),
                        ...(logoAttachment ? [logoAttachment] : []),
                    ];
                    return await this.nodemailerService.sendEmailWithTemplate(
                        to,
                        subject,
                        templateFile,
                        templateData,
                        bcc,
                        allAttachments.length > 0 ? allAttachments : undefined,
                        undefined,
                        smtpConfig,
                    );
                }
            }
        } catch (error) {
            this.logger.error('Failed to send email:', error.message);
            return false;
        }
    }

    async sendChangePassword({ name, email }: EmailSendDto, companyId?: string, locationId?: string): Promise<boolean> {
        try {
            const templateData = {
                name,
                homeName: this.homeName,
                homeUrl: this.homeUrl,
                supportEmail: this.supportEmail,
            };

            return await this.sendEmailWithProvider(
                email,
                name,
                'Password Changed Successfully',
                'change-password.html',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendChangePassword error:', err);
            return false;
        }
    }

    async sendWelcome({ name, email, password, referral_code }: EmailSendDto, companyId?: string, locationId?: string): Promise<boolean> {
        try {
            const frontUrl = process.env.FRONT_URL || this.homeUrl;
            const templateData = {
                name: name,
                email: email,
                password: password,
                frontUrl: frontUrl,
            };

            if (referral_code) {
                templateData['referral_code'] = referral_code;
                templateData['referral_link'] = `${frontUrl}/register?referral_code=${referral_code}`;
                return await this.sendEmailWithProvider(
                    email,
                    name,
                    `Welcome to PeopleGem`,
                    'welcome_agent.hjs',
                    templateData,
                    undefined,
                    undefined,
                    undefined,
                    companyId,
                    locationId
                );
            } else {
                return await this.sendEmailWithProvider(
                    email,
                    name,
                    `Welcome to PeopleGem`,
                    'welcome.hjs',
                    templateData,
                    undefined,
                    undefined,
                    undefined,
                    companyId,
                    locationId
                );
            }

        } catch (err: unknown) {
            this.logger.error('sendWelcome error:', err);
            return false;
        }
    }

    async sendCreate(
        { name, email }: EmailSendDto,
        { password: passwordString, passwordExpiredAt }: EmailCreateDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean> {
        try {
            const expiredDate = this.helperDateService.formatToIso(passwordExpiredAt);
            const templateData = {
                name,
                password: passwordString,
                expiredDate,
                homeName: this.homeName,
                homeUrl: this.homeUrl,
                supportEmail: this.supportEmail,
            };

            return await this.sendEmailWithProvider(
                email,
                name,
                'Account Created - Temporary Password',
                'account-created.html',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendCreate error:', err);
            return false;
        }
    }

    async sendTempPassword(
        { name, email }: EmailSendDto,
        { password: passwordString, passwordExpiredAt }: EmailTempPasswordDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean> {
        try {
            const expiredDate = this.helperDateService.formatToIso(passwordExpiredAt);
            const templateData = {
                name,
                password: passwordString,
                expiredDate,
                homeName: this.homeName,
                homeUrl: this.homeUrl,
                supportEmail: this.supportEmail,
            };

            return await this.sendEmailWithProvider(
                email,
                name,
                'Temporary Password',
                'temp-password.html',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendTempPassword error:', err);
            return false;
        }
    }

    async sendResetPassword(
        { name, email }: EmailSendDto,
        { expiredDate, url }: EmailResetPasswordDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean> {
        try {
            const templateData = {
                name,
                url,
                expiredDate: this.helperDateService.formatToIso(expiredDate),
                homeName: this.homeName,
                homeUrl: this.homeUrl,
                supportEmail: this.supportEmail,
            };

            return await this.sendEmailWithProvider(
                email,
                name,
                'Reset Your Password',
                'reset-password.html',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendResetPassword error:', err);
            return false;
        }
    }

    async sendVerification(
        { name, email }: EmailSendDto,
        { expiredAt, reference, otp }: EmailVerificationDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean> {
        try {
            const templateData = {
                name,
                otp,
                reference,
                expiredAt: this.helperDateService.formatToIso(expiredAt),
                homeName: this.homeName,
                homeUrl: this.homeUrl,
                supportEmail: this.supportEmail,
            };

            return await this.sendEmailWithProvider(
                email,
                name,
                'Email Verification Code',
                'verification.html',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendVerification error:', err);
            return false;
        }
    }

    async sendAssessmentVerification(
        { email, name }: EmailSendDto,
        { otp }: AssessmentEmailVerificationDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean> {
        try {
            const templateData = {
                otp
            };

            return await this.sendEmailWithProvider(
                email,
                name ?? 'User',
                'Email Verification Code',
                'assessment_verification.hjs',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendVerification error:', err);
            return false;
        }
    }

    async sendEmailVerified(
        { name, email }: EmailSendDto,
        { reference }: EmailVerifiedDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean> {
        try {
            const templateData = {
                name,
                reference,
                homeName: this.homeName,
                homeUrl: this.homeUrl,
                supportEmail: this.supportEmail,
            };

            return await this.sendEmailWithProvider(
                email,
                name,
                'Email Verified Successfully',
                'email-verified.html',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendEmailVerified error:', err);
            return false;
        }
    }

    async sendMobileNumberVerified(
        { name, email }: EmailSendDto,
        { reference, mobileNumber }: EmailMobileNumberVerifiedDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean> {
        try {
            const templateData = {
                name,
                reference,
                mobileNumber,
                homeName: this.homeName,
                homeUrl: this.homeUrl,
                supportEmail: this.supportEmail,
            };

            return await this.sendEmailWithProvider(
                email,
                name,
                'Mobile Number Verified',
                'mobile-verified.html',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendMobileNumberVerified error:', err);
            return false;
        }
    }

    /**
     * Send admin notification when a subscription is created
     */
    async sendAdminSubscriptionCreated(subscriptionData: any, companyId?: string, locationId?: string): Promise<boolean> {
        try {
            const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
            if (!adminEmail) {
                this.logger.warn('ADMIN_EMAIL not configured, skipping admin notification');
                return false;
            }

            // Use PeopleGem system logo for subscription emails (not company logo)
            const logo = this.configService.get<string>('FRONT_LOGO_URL') || `${this.getBackendUrl()}/public/logo.png`;

            const templateData = {
                appName: this.homeName,
                logo,
                companyName: subscriptionData.companyName || 'N/A',
                customerName: subscriptionData.customerName || 'N/A',
                customerEmail: subscriptionData.customerEmail || 'N/A',
                planName: subscriptionData.planName || 'N/A',
                locations: subscriptionData.locations || null,
                totalPrice: subscriptionData.totalPrice?.toFixed(2) || '0.00',
                finalPrice: subscriptionData.finalPrice?.toFixed(2) || '0.00',
                startDate: subscriptionData.startDate || 'N/A',
                endDate: subscriptionData.endDate || 'N/A',
                discountCode: subscriptionData.discountCode || null,
                currencySymbol: this.currencySymbol,
            };

            return await this.sendEmailWithProvider(
                adminEmail,
                'Admin',
                '🎉 New Subscription Created',
                'admin-subscription-created.hjs',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendAdminSubscriptionCreated error:', err);
            return false;
        }
    }

    /**
     * Send admin notification when a subscription is updated
     */
    async sendAdminSubscriptionUpdated(subscriptionData: any, companyId?: string, locationId?: string): Promise<boolean> {
        try {
            const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
            if (!adminEmail) {
                this.logger.warn('ADMIN_EMAIL not configured, skipping admin notification');
                return false;
            }

            // Use PeopleGem system logo for subscription emails (not company logo)
            const logo = this.configService.get<string>('FRONT_LOGO_URL') || `${this.getBackendUrl()}/public/logo.png`;

            const templateData = {
                appName: this.homeName,
                logo,
                companyName: subscriptionData.companyName || 'N/A',
                customerName: subscriptionData.customerName || 'N/A',
                customerEmail: subscriptionData.customerEmail || 'N/A',
                planName: subscriptionData.planName || 'N/A',
                locations: subscriptionData.locations || null,
                totalPrice: subscriptionData.totalPrice?.toFixed(2) || '0.00',
                finalPrice: subscriptionData.finalPrice?.toFixed(2) || '0.00',
                status: subscriptionData.status ? 'Active' : 'Inactive',
                endDate: subscriptionData.endDate || 'N/A',
                discountCode: subscriptionData.discountCode || null,
                currencySymbol: this.currencySymbol,
            };

            return await this.sendEmailWithProvider(
                adminEmail,
                'Admin',
                '📝 Subscription Updated',
                'admin-subscription-updated.hjs',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendAdminSubscriptionUpdated error:', err);
            return false;
        }
    }

    /**
     * Send admin notification when a subscription is upgraded
     */
    async sendAdminSubscriptionUpgraded(subscriptionData: any, companyId?: string, locationId?: string): Promise<boolean> {
        try {
            const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
            if (!adminEmail) {
                this.logger.warn('ADMIN_EMAIL not configured, skipping admin notification');
                return false;
            }

            // Use PeopleGem system logo for subscription emails (not company logo)
            const logo = this.configService.get<string>('FRONT_LOGO_URL') || `${this.getBackendUrl()}/public/logo.png`;

            const templateData = {
                appName: this.homeName,
                logo,
                companyName: subscriptionData.companyName || 'N/A',
                customerName: subscriptionData.customerName || 'N/A',
                customerEmail: subscriptionData.customerEmail || 'N/A',
                planName: subscriptionData.planName || 'N/A',
                locations: subscriptionData.locations || null,
                totalPrice: subscriptionData.totalPrice?.toFixed(2) || '0.00',
                finalPrice: subscriptionData.finalPrice?.toFixed(2) || '0.00',
                startDate: subscriptionData.startDate || 'N/A',
                endDate: subscriptionData.endDate || 'N/A',
                discountCode: subscriptionData.discountCode || null,
                currencySymbol: this.currencySymbol,
            };

            return await this.sendEmailWithProvider(
                adminEmail,
                'Admin',
                '⬆️ Subscription Upgraded',
                'admin-subscription-upgraded.hjs',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendAdminSubscriptionUpgraded error:', err);
            return false;
        }
    }

    /**
     * Send admin notification when a subscription is cancelled
     */
    async sendAdminSubscriptionCancelled(subscriptionData: any, companyId?: string, locationId?: string): Promise<boolean> {
        try {
            const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
            if (!adminEmail) {
                this.logger.warn('ADMIN_EMAIL not configured, skipping admin notification');
                return false;
            }

            // Use PeopleGem system logo for subscription emails (not company logo)
            const logo = this.configService.get<string>('FRONT_LOGO_URL') || `${this.getBackendUrl()}/public/logo.png`;

            const templateData = {
                appName: this.homeName,
                logo,
                companyName: subscriptionData.companyName || 'N/A',
                customerName: subscriptionData.customerName || 'N/A',
                customerEmail: subscriptionData.customerEmail || 'N/A',
                planName: subscriptionData.planName || 'N/A',
                cancelledDate: subscriptionData.cancelledDate || new Date().toISOString().split('T')[0],
                endDate: subscriptionData.endDate || 'N/A',
            };

            return await this.sendEmailWithProvider(
                adminEmail,
                'Admin',
                '❌ Subscription Cancelled',
                'admin-subscription-cancelled.hjs',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendAdminSubscriptionCancelled error:', err);
            return false;
        }
    }

    /**
     * Send user notification when their subscription is created
     */
    async sendUserSubscriptionCreated(userData: any, subscriptionData: any, companyId?: string, locationId?: string): Promise<boolean> {
        try {
            if (!userData.email) {
                this.logger.warn('User email not provided, skipping user notification');
                return false;
            }

            const logo = this.configService.get<string>('FRONT_LOGO_URL') || `${this.getBackendUrl()}/public/logo.png`;

            const templateData = {
                name: userData.name || 'Customer',
                email: userData.email,
                plan_name: subscriptionData.planName || 'N/A',
                plan_type: subscriptionData.planType || 'subscription',
                locations: subscriptionData.locations || null,
                transation_id: subscriptionData.transactionId || 'N/A',
                method: subscriptionData.method || 'Card',
                gateway: subscriptionData.gateway || 'Payment Gateway',
                postDateTime: subscriptionData.startDate || new Date().toISOString().split('T')[0],
                status: 'Active',
                content: 'Your subscription has been successfully activated. You now have access to all the features included in your plan.',
                logo,
            };

            return await this.sendEmailWithProvider(
                userData.email,
                userData.name || 'Customer',
                '🎉 Subscription Activated Successfully',
                'customer_subscription_plan.hjs',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendUserSubscriptionCreated error:', err);
            return false;
        }
    }

    /**
     * Send user notification when their subscription is updated
     */
    async sendUserSubscriptionUpdated(userData: any, subscriptionData: any, companyId?: string, locationId?: string): Promise<boolean> {
        try {
            if (!userData.email) {
                this.logger.warn('User email not provided, skipping user notification');
                return false;
            }

            const logo = this.configService.get<string>('FRONT_LOGO_URL') || `${this.getBackendUrl()}/public/logo.png`;

            const templateData = {
                name: userData.name || 'Customer',
                email: userData.email,
                plan_name: subscriptionData.planName || 'N/A',
                plan_type: subscriptionData.planType || 'subscription',
                locations: subscriptionData.locations || null,
                postDateTime: new Date().toISOString().split('T')[0],
                status: subscriptionData.status ? 'Active' : 'Inactive',
                content: 'Your subscription has been updated. The changes are now in effect.',
                logo,
            };

            return await this.sendEmailWithProvider(
                userData.email,
                userData.name || 'Customer',
                '📝 Subscription Updated',
                'customer_subscription_plan.hjs',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendUserSubscriptionUpdated error:', err);
            return false;
        }
    }

    /**
     * Send user notification when their subscription is upgraded
     */
    async sendUserSubscriptionUpgraded(userData: any, subscriptionData: any, companyId?: string, locationId?: string): Promise<boolean> {
        try {
            if (!userData.email) {
                this.logger.warn('User email not provided, skipping user notification');
                return false;
            }

            const logo = this.configService.get<string>('FRONT_LOGO_URL') || `${this.getBackendUrl()}/public/logo.png`;

            const templateData = {
                name: userData.name || 'Customer',
                email: userData.email,
                plan_name: subscriptionData.planName || 'N/A',
                plan_type: subscriptionData.planType || 'subscription',
                locations: subscriptionData.locations || null,
                transation_id: subscriptionData.transactionId || 'N/A',
                method: subscriptionData.method || 'Card',
                gateway: subscriptionData.gateway || 'Payment Gateway',
                postDateTime: subscriptionData.startDate || new Date().toISOString().split('T')[0],
                status: 'Active',
                content: 'Congratulations! Your subscription has been upgraded. You now have access to enhanced features and benefits.',
                logo,
            };

            return await this.sendEmailWithProvider(
                userData.email,
                userData.name || 'Customer',
                '⬆️ Subscription Upgraded Successfully',
                'customer_subscription_plan.hjs',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendUserSubscriptionUpgraded error:', err);
            return false;
        }
    }

    /**
     * Send user notification when their subscription is cancelled
     */
    async sendUserSubscriptionCancelled(userData: any, subscriptionData: any, companyId?: string, locationId?: string): Promise<boolean> {
        try {
            if (!userData.email) {
                this.logger.warn('User email not provided, skipping user notification');
                return false;
            }

            const logo = this.configService.get<string>('FRONT_LOGO_URL') || `${this.getBackendUrl()}/public/logo.png`;

            const templateData = {
                name: userData.name || 'Customer',
                email: userData.email,
                plan: subscriptionData.planName || 'N/A',
                count: 0, // Days until cancellation
                content: 'Your subscription has been cancelled. You will retain access until the end of your current billing period.',
                logo,
            };

            return await this.sendEmailWithProvider(
                userData.email,
                userData.name || 'Customer',
                '❌ Subscription Cancelled',
                'cancel_subscription.hjs',
                templateData,
                undefined,
                undefined,
                undefined,
                companyId,
                locationId
            );
        } catch (err: unknown) {
            this.logger.error('sendUserSubscriptionCancelled error:', err);
            return false;
        }
    }

}