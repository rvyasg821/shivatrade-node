import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { EnhancedEmailService } from '@modules/email/services/enhanced-email.service';
import { NodemailerService } from '@modules/email/services/nodemailer.service';
import { SmsService } from '@modules/sms/services/sms.service';
import { WhatsAppService } from '@modules/whatsapp/services/whatsapp.service';
import { NotificationEventRepository } from '../repository/repositories/notification-event.repository';
import { NotificationTemplateRepository } from '../repository/repositories/notification-template.repository';
import { NotificationPreferenceRepository } from '../repository/repositories/notification-preference.repository';
import {
    ENUM_NOTIFICATION_EVENT_TYPE,
    ENUM_NOTIFICATION_CHANNEL,
} from '../enums/notification.enum';
import { MessageLogContext } from '@modules/message-log/services/message-log-context';
import { ENUM_MESSAGE_LOG_RECIPIENT_TYPE } from '@modules/message-log/enums/message-log.enum';
import { NotificationRecipientResolverService, IResolvedRecipient } from './notification-recipient-resolver.service';

export interface NotifyOptions {
    companyId: string;
    locationId?: string;
    to: { email?: string; phone?: string; name: string };
    subject: string;
    emailTemplate?: string;
    emailData?: any;
    smsBody?: string;
    whatsappBody?: string;
}

export interface EventNotifyOptions {
    eventKey: string;
    companyId: string;
    locationId?: string;
    recipients: Array<{ email?: string; phone?: string; name: string; user_id?: string }>;
    variables: Record<string, any>;
    // Optional context for message logging
    triggeredByUserId?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
}

interface NotifyResult {
    email: boolean | null;
    sms: any;
    whatsapp: any;
}

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);
    private readonly emailEnabled: boolean;

    constructor(
        private readonly configService: ConfigService,
        private readonly companySettingsService: CompanySettingsService,
        private readonly enhancedEmailService: EnhancedEmailService,
        private readonly nodemailerService: NodemailerService,
        private readonly smsService: SmsService,
        private readonly whatsAppService: WhatsAppService,
        private readonly eventRepository: NotificationEventRepository,
        private readonly templateRepository: NotificationTemplateRepository,
        private readonly preferenceRepository: NotificationPreferenceRepository,
        private readonly recipientResolver: NotificationRecipientResolverService,
    ) {
        this.emailEnabled = this.configService.get<string>('EMAIL_ENABLED', 'true') === 'true'
            || this.configService.get<string>('app.env', 'development') === 'production';
    }

    /**
     * Legacy notify method — direct send without event system.
     * Kept for backward compatibility with existing callers.
     */
    async notify(opts: NotifyOptions): Promise<NotifyResult> {
        const settings = this.companySettingsService.mapGet(
            await this.companySettingsService.getOrCreate(opts.companyId, opts.locationId)
        );

        const results: NotifyResult = { email: null, sms: null, whatsapp: null };

        // Email
        if (settings.smtp_enabled && opts.to.email && opts.emailTemplate) {
            try {
                results.email = await this.enhancedEmailService.sendEmailWithProvider(
                    opts.to.email,
                    opts.to.name,
                    opts.subject,
                    opts.emailTemplate,
                    opts.emailData || {},
                    [],
                    undefined,
                    {
                        smtp_enabled: settings.smtp_enabled,
                        smtp_host: settings.smtp_host,
                        smtp_port: settings.smtp_port,
                        smtp_username: settings.smtp_username,
                        smtp_password: settings.smtp_password,
                        smtp_from_email: settings.smtp_from_email,
                        smtp_from_name: settings.smtp_from_name,
                        smtp_secure: settings.smtp_secure,
                    },
                    opts.companyId,
                    opts.locationId,
                );
            } catch (error) {
                this.logger.error(`Notification email failed: ${error.message}`);
            }
        }

        // SMS
        if (settings.sms_enabled && opts.to.phone && opts.smsBody) {
            try {
                results.sms = await this.smsService.sendSms(
                    {
                        sms_api_key: settings.sms_api_key,
                        sms_api_secret: settings.sms_api_secret,
                        sms_from_number: settings.sms_from_number,
                    },
                    opts.to.phone,
                    opts.smsBody,
                );
            } catch (error) {
                this.logger.error(`Notification SMS failed: ${error.message}`);
            }
        }

        // WhatsApp
        if (settings.whatsapp_enabled && opts.to.phone && opts.whatsappBody) {
            try {
                results.whatsapp = await this.whatsAppService.send(
                    {
                        whatsapp_enabled: settings.whatsapp_enabled,
                        whatsapp_provider: settings.whatsapp_provider,
                        whatsapp_api_key: settings.whatsapp_api_key,
                        whatsapp_api_secret: settings.whatsapp_api_secret,
                        whatsapp_from_number: settings.whatsapp_from_number,
                    },
                    opts.to.phone,
                    opts.whatsappBody,
                );
            } catch (error) {
                this.logger.error(`Notification WhatsApp failed: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * Event-based notification — the main entry point for the notification system.
     * Resolves preferences, templates, and sends via all enabled channels.
     */
    async sendEventNotification(opts: EventNotifyOptions): Promise<void> {
        try {
            // 1. Validate event exists and is active
            const event = await this.eventRepository.findByEventKey(opts.eventKey);
            if (!event) {
                this.logger.warn(`Notification event not found or inactive: ${opts.eventKey}`);
                return;
            }

            // 2. System events should not use this method (they use EnhancedEmailService directly)
            if (event.event_type === ENUM_NOTIFICATION_EVENT_TYPE.SYSTEM) {
                this.logger.warn(`System event ${opts.eventKey} should not be sent via event notification`);
                return;
            }

            // 3. Resolve channel preferences (location → company → defaults)
            //    Now also returns the recipient-type matrix (Phase 2).
            const prefs = await this.preferenceRepository.resolvePreference(
                opts.eventKey,
                opts.companyId,
                opts.locationId,
            );

            // 4. Get company settings for SMTP/SMS/WhatsApp credentials
            const settings = this.companySettingsService.mapGet(
                await this.companySettingsService.getOrCreate(opts.companyId, opts.locationId)
            );

            // 5. Build the full recipient list using the recipient-type matrix.
            //    The base recipients passed in are treated as employees; resolver
            //    adds location admins / company admins per the prefs flags.
            const resolvedRecipients = await this.recipientResolver.resolveRecipients(
                opts.recipients || [],
                {
                    notify_employee: prefs.notify_employee,
                    notify_location_admin: prefs.notify_location_admin,
                    notify_company_admin: prefs.notify_company_admin,
                },
                { companyId: opts.companyId, locationId: opts.locationId },
            );

            // 6. Send via each enabled channel, wrapping each call in
            //    MessageLogContext so the lower-level provider services tag
            //    log entries with the right event/recipient metadata.
            for (const recipient of resolvedRecipients) {
                await MessageLogContext.run(
                    {
                        eventKey: opts.eventKey,
                        companyId: opts.companyId,
                        locationId: opts.locationId,
                        recipientType: recipient.recipient_type,
                        recipientUserId: recipient.user_id,
                        recipientName: recipient.name,
                        triggeredByUserId: opts.triggeredByUserId,
                        relatedEntityType: opts.relatedEntityType,
                        relatedEntityId: opts.relatedEntityId,
                    },
                    async () => {
                        // EMAIL
                        if (prefs.email_enabled && this.emailEnabled && recipient.email) {
                            await this.sendEmailChannel(opts, recipient, settings);
                        }

                        // SMS
                        if (prefs.sms_enabled && settings.sms_enabled && recipient.phone) {
                            await this.sendSmsChannel(opts, recipient, settings);
                        }

                        // WHATSAPP
                        if (prefs.whatsapp_enabled && settings.whatsapp_enabled && recipient.phone) {
                            await this.sendWhatsAppChannel(opts, recipient, settings);
                        }
                    },
                );
            }

            this.logger.log(`Event notification sent: ${opts.eventKey} to ${resolvedRecipients.length} recipient(s)`);
        } catch (error) {
            this.logger.error(`Failed to send event notification ${opts.eventKey}: ${error.message}`);
        }
    }

    /**
     * Send email for an event using resolved template
     */
    private async sendEmailChannel(
        opts: EventNotifyOptions,
        recipient: IResolvedRecipient,
        settings: any,
    ): Promise<void> {
        try {
            const template = await this.templateRepository.resolveTemplate(
                opts.eventKey,
                ENUM_NOTIFICATION_CHANNEL.EMAIL,
                opts.companyId,
                opts.locationId,
            );

            if (!template) {
                this.logger.warn(`No email template found for event: ${opts.eventKey}`);
                return;
            }

            // Build template data with global vars
            const templateData: any = {
                ...opts.variables,
                recipient_name: recipient.name,
            };

            const subject = this.replaceVariables(template.subject || opts.eventKey, templateData);
            const smtpConfig = this.buildSmtpConfig(settings);

            if (template.body.endsWith('.hbs')) {
                // File-based Handlebars template
                // sendEmailWithProvider handles company logo injection + CID attachment
                await this.enhancedEmailService.sendEmailWithProvider(
                    recipient.email,
                    recipient.name,
                    subject,
                    template.body,
                    templateData,
                    [],
                    undefined,
                    smtpConfig,
                    opts.companyId,
                    opts.locationId,
                );
            } else {
                // Inline HTML template (company/location overrides from DB)
                // Inject company logo as CID attachment for inline templates
                let logoAttachments: any[] = [];
                if (opts.companyId && !templateData.logo) {
                    try {
                        const companyDefaults = await this.companySettingsService.getCompanyDefaults(opts.companyId);
                        const mapped = this.companySettingsService.mapGet(companyDefaults);
                        if (mapped.logo_url) {
                            const fs = require('fs');
                            const nodePath = require('path');
                            if (mapped.logo_url.startsWith('http')) {
                                templateData.logo = mapped.logo_url;
                            } else {
                                const relativePath = mapped.logo_url.replace(/^\/assets\//, '');
                                const filePath = nodePath.join(process.cwd(), 'public', relativePath);
                                if (fs.existsSync(filePath)) {
                                    templateData.logo = 'cid:company-logo';
                                    logoAttachments = [{
                                        filename: nodePath.basename(filePath),
                                        path: filePath,
                                        cid: 'company-logo',
                                    }];
                                }
                            }
                        }
                    } catch {}
                }
                const html = this.replaceVariables(template.body, templateData);
                await this.nodemailerService.sendEmailWithHtml(
                    recipient.email,
                    subject,
                    html,
                    undefined,
                    [],
                    logoAttachments.length > 0 ? logoAttachments : undefined,
                    smtpConfig,
                );
            }
        } catch (error) {
            this.logger.error(`Email channel failed for ${opts.eventKey}: ${error.message}`);
        }
    }

    /**
     * Send SMS for an event using resolved template
     */
    private async sendSmsChannel(
        opts: EventNotifyOptions,
        recipient: IResolvedRecipient,
        settings: any,
    ): Promise<void> {
        try {
            const template = await this.templateRepository.resolveTemplate(
                opts.eventKey,
                ENUM_NOTIFICATION_CHANNEL.SMS,
                opts.companyId,
                opts.locationId,
            );

            if (!template) {
                this.logger.debug(`No SMS template found for event: ${opts.eventKey}`);
                return;
            }

            const body = this.replaceVariables(template.body, {
                ...opts.variables,
                recipient_name: recipient.name,
            });

            await this.smsService.sendSms(
                {
                    sms_api_key: settings.sms_api_key,
                    sms_api_secret: settings.sms_api_secret,
                    sms_from_number: settings.sms_from_number,
                },
                recipient.phone,
                body,
            );
        } catch (error) {
            this.logger.error(`SMS channel failed for ${opts.eventKey}: ${error.message}`);
        }
    }

    /**
     * Send WhatsApp for an event using resolved template
     */
    private async sendWhatsAppChannel(
        opts: EventNotifyOptions,
        recipient: IResolvedRecipient,
        settings: any,
    ): Promise<void> {
        try {
            const template = await this.templateRepository.resolveTemplate(
                opts.eventKey,
                ENUM_NOTIFICATION_CHANNEL.WHATSAPP,
                opts.companyId,
                opts.locationId,
            );

            if (!template) {
                this.logger.debug(`No WhatsApp template found for event: ${opts.eventKey}`);
                return;
            }

            const body = this.replaceVariables(template.body, {
                ...opts.variables,
                recipient_name: recipient.name,
            });

            await this.whatsAppService.send(
                {
                    whatsapp_enabled: settings.whatsapp_enabled,
                    whatsapp_provider: settings.whatsapp_provider,
                    whatsapp_api_key: settings.whatsapp_api_key,
                    whatsapp_api_secret: settings.whatsapp_api_secret,
                    whatsapp_from_number: settings.whatsapp_from_number,
                },
                recipient.phone,
                body,
            );
        } catch (error) {
            this.logger.error(`WhatsApp channel failed for ${opts.eventKey}: ${error.message}`);
        }
    }

    /**
     * Replace {{variable}} placeholders in a string
     */
    private replaceVariables(text: string, variables: Record<string, any>): string {
        if (!text) return '';
        return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return variables[key] !== undefined && variables[key] !== null
                ? String(variables[key])
                : match;
        });
    }

    /**
     * Build SMTP config from company settings (for company-level emails)
     */
    private buildSmtpConfig(settings: any) {
        if (settings.smtp_enabled && settings.smtp_host) {
            return {
                smtp_enabled: settings.smtp_enabled,
                smtp_host: settings.smtp_host,
                smtp_port: settings.smtp_port,
                smtp_username: settings.smtp_username,
                smtp_password: settings.smtp_password,
                smtp_from_email: settings.smtp_from_email,
                smtp_from_name: settings.smtp_from_name,
                smtp_secure: settings.smtp_secure,
            };
        }
        // No company SMTP → will fall back to ENV SMTP in EnhancedEmailService
        return undefined;
    }
}
