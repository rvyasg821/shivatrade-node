import { ENUM_SEND_SMS_PROCESS } from '@modules/sms/enums/sms.enum';
import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SmsSendRequestDto } from '@modules/sms/dtos/request/sms.send.request.dto';
import { SmsVerificationRequestDto } from '@modules/sms/dtos/request/sms.verification.request.dto';
import { ISmsProcessor } from '@modules/sms/interfaces/sms.processor.interface';
import { SmsService } from '@modules/sms/services/sms.service';
import { SmsConfig } from '@modules/sms/services/twilio-sms.service';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { ENUM_WORKER_QUEUES } from '@workers/enums/worker.enum';
import { WorkerBase } from '@workers/bases/worker.base';

@Processor({
    name: ENUM_WORKER_QUEUES.SMS_QUEUE,
})
export class SmsProcessor extends WorkerBase implements ISmsProcessor {
    private readonly logger = new Logger(SmsProcessor.name);

    constructor(
        private readonly smsService: SmsService,
        private readonly companySettingsService: CompanySettingsService,
    ) {
        super();
    }

    async process(job: Job<any>): Promise<any> {
        try {
            switch (job.name) {
                case ENUM_SEND_SMS_PROCESS.VERIFICATION:
                    const smsConfig = await this.resolveCompanySmsConfig(
                        job.data.companyId,
                        job.data.locationId
                    );
                    await this.processOtpVerificationSms(
                        job.data.send,
                        job.data.data as SmsVerificationRequestDto,
                        smsConfig
                    );
                    return;
                default:
                    return;
            }
        } catch (error: unknown) {
            throw error;
        }
    }

    async processOtpVerificationSms(
        send: SmsSendRequestDto,
        data: SmsVerificationRequestDto,
        smsConfig?: SmsConfig
    ): Promise<void> {
        await this.smsService.sendVerification(send, data, smsConfig);
    }

    private async resolveCompanySmsConfig(companyId?: string, locationId?: string): Promise<SmsConfig | undefined> {
        if (!companyId) return undefined;
        try {
            const settings = await this.companySettingsService.getOrCreate(companyId, locationId);
            const mapped = this.companySettingsService.mapGet(settings);
            if (mapped.sms_api_key && mapped.sms_api_secret && mapped.sms_from_number) {
                return {
                    sms_api_key: mapped.sms_api_key,
                    sms_api_secret: mapped.sms_api_secret,
                    sms_from_number: mapped.sms_from_number,
                };
            }
        } catch (error) {
            this.logger.warn(`Failed to resolve company SMS config for company ${companyId}: ${error.message}`);
        }
        return undefined;
    }
}
