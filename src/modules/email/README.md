# Azure Email Service Integration

This module provides Azure M365 email service integration for your NestJS application, allowing you to send emails through Microsoft Graph API.

## Features

- **Azure M365 Email Service**: Send emails using Microsoft Graph API
- **Template Support**: Send emails with HTML templates
- **File Attachments**: Support for file attachments
- **Multiple Recipients**: Support for CC and BCC recipients
- **Provider Switching**: Easily switch between Nodemailer and Azure email providers
- **Configuration Management**: Store Azure credentials in your settings system

## Installation

Install the required Azure MSAL package:

```bash
yarn add @azure/msal-node
# or
npm install @azure/msal-node
```

## Configuration

### 1. Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Fill in the application details:
   - Name: Your application name
   - Supported account types: Choose appropriate option
   - Redirect URI: Not needed for this use case
5. After registration, note down:
   - **Application (client) ID**
   - **Directory (tenant) ID**
6. Go to **Certificates & secrets** > **Client secrets**
7. Click **New client secret** and note down the **Value**

### 2. API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission** > **Microsoft Graph** > **Application permissions**
3. Add the following permissions:
   - `Mail.Send` - Send mail as any user
4. Click **Grant admin consent**

### 3. Application Settings

Add the following settings to your application's settings system:

```typescript
// Settings to add via your settings service
{
  key: 'azure_email_client_id',
  value: 'your-client-id-here'
},
{
  key: 'azure_email_client_secret', 
  value: 'your-client-secret-here'
},
{
  key: 'azure_email_tenant_id',
  value: 'your-tenant-id-here'
},
{
  key: 'azure_email_from_email',
  value: 'noreply@yourdomain.com'
},
{
  key: 'azure_email_from_name',
  value: 'Your Company Name'
},
{
  key: 'email_provider',
  value: 'azure' // or 'nodemailer'
}
```

## Usage

### 1. Basic Email Sending

```typescript
import { AzureEmailService } from '@modules/email/services/azure-email.service';

@Injectable()
export class YourService {
  constructor(private readonly azureEmailService: AzureEmailService) {}

  async sendEmail() {
    const config = await this.azureEmailService.getAzureEmailConfig();
    const emailData = {
      to: 'user@example.com',
      name: 'John Doe',
      subject: 'Welcome!',
      content: '<h1>Welcome to our platform!</h1>',
    };

    const result = await this.azureEmailService.sendAzureM365Email(config, emailData);
    return result;
  }
}
```

### 2. Using Enhanced Email Service

```typescript
import { EnhancedEmailService } from '@modules/email/services/enhanced-email.service';

@Injectable()
export class YourService {
  constructor(private readonly enhancedEmailService: EnhancedEmailService) {}

  async sendWelcomeEmail() {
    const emailData = {
      name: 'John Doe',
      email: 'user@example.com'
    };

    // This will automatically use the configured provider (Azure or Nodemailer)
    const result = await this.enhancedEmailService.sendWelcome(emailData);
    return result;
  }
}
```

### 3. Template Email with Attachments

```typescript
const result = await this.azureEmailService.sendEmailWithTemplate(
  'user@example.com',
  'John Doe',
  'Welcome to our platform',
  'welcome.html',
  {
    name: 'John Doe',
    homeName: 'Your Company',
    homeUrl: 'https://yourcompany.com'
  },
  'documents/welcome-guide.pdf' // Optional attachment
);
```

## Service Integration

The Azure email service is designed to be used directly in your application services and controllers. You can inject either the `AzureEmailService` for direct Azure functionality or the `EnhancedEmailService` for automatic provider switching.

## Email Templates

Templates are stored in `src/modules/email/templates/` and use simple placeholder replacement:

```html
<!DOCTYPE html>
<html>
<head>
    <title>{{subject}}</title>
</head>
<body>
    <h1>Hello {{name}}!</h1>
    <p>Welcome to {{homeName}}.</p>
    <a href="{{homeUrl}}">Visit our website</a>
</body>
</html>
```

## Error Handling

The service includes comprehensive error handling:

- **Configuration Errors**: Missing Azure credentials
- **Authentication Errors**: Invalid credentials or expired tokens
- **API Errors**: Microsoft Graph API failures
- **File Errors**: Missing attachment files
- **Network Errors**: Connection issues

All errors are logged using NestJS Logger and return boolean success indicators.

## Security Considerations

1. **Store credentials securely** in your settings system
2. **Use environment variables** for sensitive data in production
3. **Implement proper access controls** for the API endpoints
4. **Validate email addresses** before sending
5. **Rate limit** email sending to prevent abuse

## Troubleshooting

### Common Issues

1. **"Forbidden" errors**: Check API permissions and admin consent
2. **"Invalid client" errors**: Verify client ID and secret
3. **"Tenant not found" errors**: Check tenant ID
4. **"Mailbox not found" errors**: Ensure from email exists in your tenant

### Debug Mode

Enable debug logging by setting log level to 'debug' in your NestJS configuration.

## Migration from Existing Email Service

The `EnhancedEmailService` is designed to be a drop-in replacement for your existing `EmailService`. Simply:

1. Replace `EmailService` with `EnhancedEmailService` in your imports
2. Set the `email_provider` setting to `'azure'`
3. Configure Azure settings as described above

The service will automatically route emails through Azure while maintaining the same interface.