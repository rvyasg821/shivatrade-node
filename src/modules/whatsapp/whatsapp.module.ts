import { Module } from '@nestjs/common';
import { WhatsAppService } from './services/whatsapp.service';
import { TwilioWhatsAppService } from './services/twilio-whatsapp.service';
import { MetaWhatsAppService } from './services/meta-whatsapp.service';
import { MessageLogModule } from '@modules/message-log/message-log.module';

@Module({
    imports: [MessageLogModule],
    providers: [WhatsAppService, TwilioWhatsAppService, MetaWhatsAppService],
    exports: [WhatsAppService],
})
export class WhatsAppModule {}
