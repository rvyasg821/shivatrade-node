import { Module } from '@nestjs/common';
import { EmailModule } from '@modules/email/email.module';
import { EmailProcessor } from '@modules/email/processors/email.processor';
import { SessionModule } from '@modules/session/session.module';
import { SmsProcessor } from '@modules/sms/processors/sms.processor';
import { SmsModule } from '@modules/sms/sms.module';
import { WhatsAppModule } from '@modules/whatsapp/whatsapp.module';
import { WhatsAppProcessor } from '@modules/whatsapp/processors/whatsapp.processor';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';

@Module({
    imports: [EmailModule, SessionModule, SmsModule, WhatsAppModule, CompanySettingsModule],
    providers: [EmailProcessor, SmsProcessor, WhatsAppProcessor],
})
export class WorkerModule {}
