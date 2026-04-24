import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { SettingFeatureService } from '@modules/setting/services/setting-feature.service';
import { AzureEmailConfigDto } from '@modules/email/dtos/azure-email-config.dto';
import { AzureEmailSendDto } from '@modules/email/dtos/azure-email-send.dto';
import * as handlebars from 'handlebars';

@Injectable()
export class AzureEmailService {
    private readonly logger = new Logger(AzureEmailService.name);
    private readonly publicPath = path.resolve('public');
    private readonly msURL = 'https://login.microsoftonline.com';
    private readonly tokenScope = ['https://graph.microsoft.com/.default'];

    constructor(
        private readonly configService: ConfigService,
    ) {}

    /**
     * Send email using Microsoft Graph API with Azure authentication
     */
    async sendAzureM365Email(
        config: AzureEmailConfigDto,
        emailData: AzureEmailSendDto
    ): Promise<boolean> {
        try {
            const { clientId, clientSecret, tenantId, fromEmail, fromName } = config;
            const { to, name, cc, bcc, subject, content, filePath } = emailData;

            if (!clientId || !clientSecret || !tenantId || !fromEmail || !fromName || !to) {
                throw new Error('sendAzureM365Email -> Missing required configuration or email data');
            }

            // Get access token
            const accessToken = await this.getAccessToken(clientId, clientSecret, tenantId);
            if (!accessToken) {
                throw new Error('sendAzureM365Email -> Failed to acquire access token');
            }

            // Prepare email payload
            const emailPayload = await this.prepareEmailPayload({
                to,
                name,
                cc,
                bcc,
                subject,
                content,
                filePath,
                fromEmail,
                fromName,
            });

            // Send email via Microsoft Graph API
            const graphSendMailUrl = `https://graph.microsoft.com/v1.0/users/${fromEmail}/sendMail`;
            const response = await axios.post(graphSendMailUrl, emailPayload, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.status === 202) {
                this.logger.log('Azure M365 email sent successfully!');
                return true;
            } else {
                this.logger.error(`Unexpected response status: ${response.status}`);
                return false;
            }
        } catch (error) {
            this.logger.error('sendAzureM365Email error:', error.message);
            return false;
        }
    }

    /**
     * Get Azure access token using client credentials flow
     */
    private async getAccessToken(
        clientId: string,
        clientSecret: string,
        tenantId: string
    ): Promise<string | null> {
        try {
            // Dynamic import to avoid compilation errors when package is not installed
            const { ConfidentialClientApplication } = await import('@azure/msal-node');
            
            const msalConfig = {
                auth: {
                    clientId,
                    clientSecret,
                    authority: `${this.msURL}/${tenantId}`,
                },
            };

            const cca = new ConfidentialClientApplication(msalConfig);
            const tokenResponse = await cca.acquireTokenByClientCredential({
                scopes: this.tokenScope,
            });

            return tokenResponse?.accessToken || null;
        } catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                this.logger.error('Azure MSAL package not installed. Please run: yarn add @azure/msal-node');
            } else {
                this.logger.error('Failed to acquire access token:', error.message);
            }
            return null;
        }
    }

    /**
     * Prepare email payload for Microsoft Graph API
     */
    private async prepareEmailPayload(data: {
        to: string;
        name?: string;
        cc?: string;
        bcc?: string;
        subject: string;
        content: string;
        filePath?: string;
        fromEmail: string;
        fromName: string;
    }): Promise<any> {
        const { to, name, cc, bcc, subject, content, filePath, fromEmail, fromName } = data;

        // Handle BCC recipients
        const bccRecipients = this.parseEmailRecipients(bcc);

        // Handle CC recipients
        const ccRecipients = this.parseEmailRecipients(cc);

        const emailPayload = {
            message: {
                subject,
                body: {
                    contentType: 'HTML',
                    content: content || '',
                },
                from: {
                    emailAddress: {
                        name: fromName,
                        address: fromEmail,
                    },
                },
                toRecipients: [
                    {
                        emailAddress: {
                            address: to,
                            name: name || '',
                        },
                    },
                ],
                ccRecipients,
                bccRecipients,
                attachments: [],
            },
            saveToSentItems: false,
        };

        // Handle file attachment if provided
        if (filePath) {
            const attachment = await this.prepareAttachment(filePath);
            if (attachment) {
                emailPayload.message.attachments.push(attachment);
            }
        }

        return emailPayload;
    }

    /**
     * Parse email recipients from string to array format
     */
    private parseEmailRecipients(recipients?: string): Array<{ emailAddress: { address: string } }> {
        if (!recipients) return [];

        return (Array.isArray(recipients) ? recipients : recipients.split(','))
            .map((email) => email.trim())
            .filter(Boolean)
            .map((email) => ({
                emailAddress: { address: email },
            }));
    }

    /**
     * Prepare file attachment for email
     */
    private async prepareAttachment(filePath: string): Promise<any | null> {
        try {
            const fullFilePath = path.join(this.publicPath, filePath);

            if (!fs.existsSync(fullFilePath)) {
                this.logger.warn(`Attachment file not found: ${fullFilePath}`);
                return null;
            }

            const fileName = path.basename(filePath);
            const fileBuffer = fs.readFileSync(fullFilePath);

            return {
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: fileName,
                contentBytes: fileBuffer.toString('base64'),
                contentType: 'application/octet-stream',
            };
        } catch (error) {
            this.logger.error('Failed to prepare attachment:', error.message);
            return null;
        }
    }

    /**
     * Get Azure email configuration from settings
     */
    async getAzureEmailConfig(): Promise<AzureEmailConfigDto | null> {
        try {
            const clientId = process.env.AZURE_EMAIL_CLIENT_ID;
            const clientSecret = process.env.AZURE_EMAIL_CLIENT_SECRET;
            const tenantId = process.env.AZURE_EMAIL_TENANT_ID;
            const fromEmail = process.env.AZURE_EMAIL_FROM_EMAIL;
            const fromName = process.env.AZURE_EMAIL_FROM_NAME;

            if (!clientId || !clientSecret || !tenantId || !fromEmail) {
                return null;
            }

            return {
                clientId: clientId,
                clientSecret: clientSecret,
                tenantId: tenantId,
                fromEmail: fromEmail,
                fromName: fromName ?? 'System',
            };
        } catch (error) {
            this.logger.error('Failed to get Azure email config:', error.message);
            return null;
        }
    }

    /**
     * Send email with template using Azure service
     */
    async sendEmailWithTemplate(
        to: string,
        name: string,
        subject: string,
        templateFile: string,
        templateData: any,
        filePath?: string,
        cc?: string,
        bcc?: string
    ): Promise<boolean> {
        try {
            const config = await this.getAzureEmailConfig();
            if (!config) {
                throw new Error('Azure email configuration not found');
            }

            // Read and compile template
            // Use __dirname for reliable path resolution in both dev (src/) and prod (dist/)
            const templatePath = path.resolve(__dirname, '..', 'templates', templateFile);
            if (!fs.existsSync(templatePath)) {
                throw new Error(`Template file not found: ${templatePath}`);
            }

            const templateContent = fs.readFileSync(templatePath, 'utf-8');
            // Simple template replacement - you can enhance this with handlebars if needed
            // let compiledContent = templateContent;
            // Object.keys(templateData).forEach((key) => {
            //     const regex = new RegExp(`{{${key}}}`, 'g');
            //     compiledContent = compiledContent.replace(regex, templateData[key]);
            // });
            const contextTemplateData = {
                ...templateData,
                logo: process.env.FRONT_LOGO_URL ?? '',
                frontUrl: process.env.MAIN_URL ?? 'https://app.shivatrade.com',
            };
            const compiledTemplate = handlebars.compile(templateContent);
            const html = compiledTemplate(contextTemplateData);

            const emailData: AzureEmailSendDto = {
                to,
                name,
                subject,
                // content: compiledContent,
                content: html,
                filePath,
                cc,
                bcc,
            };

            return await this.sendAzureM365Email(config, emailData);
        } catch (error) {
            console.error('sendEmailWithTemplate error:', error);
            return false;
        }
    }
}