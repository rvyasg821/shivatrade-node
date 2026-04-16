import { Global, Module } from '@nestjs/common';
import { SettingRepositoryModule } from '@modules/setting/repository/setting.repository.module';
import { SettingFeatureService } from '@modules/setting/services/setting-feature.service';
import { EmailService } from '@modules/email/services/email.service';
import { EmailTemplateService } from '@modules/email/services/email.template.service';
import { NodemailerService } from '@modules/email/services/nodemailer.service';
import { AzureEmailService } from '@modules/email/services/azure-email.service';
import { EnhancedEmailService } from '@modules/email/services/enhanced-email.service';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';
import { MessageLogModule } from '@modules/message-log/message-log.module';

@Global()
@Module({
    imports: [SettingRepositoryModule, CompanySettingsModule, MessageLogModule],
    providers: [
        EmailService, 
        EmailTemplateService, 
        NodemailerService, 
        AzureEmailService,
        EnhancedEmailService,
        SettingFeatureService
    ],
    exports: [
        EmailService, 
        EmailTemplateService, 
        NodemailerService, 
        AzureEmailService,
        EnhancedEmailService,
        SettingFeatureService
    ],
})
export class EmailModule {}