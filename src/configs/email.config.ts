import { registerAs } from '@nestjs/config';

export default registerAs(
    'email',
    (): Record<string, any> => ({
        fromEmail: process.env.SMTP_FROM || 'noreply@peoplegem.io',
        supportEmail: process.env.SMTP_SUPPORT_EMAIL || process.env.SMTP_FROM || 'support@peoplegem.io',
        host: process.env.SMTP_HOST || 'smtp.emailit.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        username: process.env.SMTP_USERNAME,
        password: process.env.SMTP_PASSWORD,
        name: process.env.SMTP_NAME || 'PeopleGem',
        secure: process.env.SMTP_SECURE === 'true',
        // Email sending control:
        // - If EMAIL_ENABLED is set, it takes precedence (true/false)
        // - Otherwise, emails only sent when APP_ENV=production
        enabled: process.env.EMAIL_ENABLED !== undefined
            ? process.env.EMAIL_ENABLED === 'true'
            : process.env.APP_ENV?.toLowerCase() === 'production',
    })
);
