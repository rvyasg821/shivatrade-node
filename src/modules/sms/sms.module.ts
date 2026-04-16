import { Module } from '@nestjs/common';

import { SmsService } from '@modules/sms/services/sms.service';
import { TwilioSmsService } from '@modules/sms/services/twilio-sms.service';
import { MessageLogModule } from '@modules/message-log/message-log.module';

@Module({
    imports: [MessageLogModule],
    exports: [SmsService, TwilioSmsService],
    providers: [SmsService, TwilioSmsService],
    controllers: [],
})
export class SmsModule {}
