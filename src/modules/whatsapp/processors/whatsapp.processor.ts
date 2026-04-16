import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WhatsAppService } from '@modules/whatsapp/services/whatsapp.service';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { ENUM_WORKER_QUEUES } from '@workers/enums/worker.enum';
import { WorkerBase } from '@workers/bases/worker.base';

@Processor({
    name: ENUM_WORKER_QUEUES.WHATSAPP_QUEUE,
})
export class WhatsAppProcessor extends WorkerBase {
    private readonly logger = new Logger(WhatsAppProcessor.name);

    constructor(
        private readonly whatsAppService: WhatsAppService,
        private readonly companySettingsService: CompanySettingsService,
    ) {
        super();
    }

    async process(job: Job<any>): Promise<any> {
        try {
            const { companyId, locationId, to, body } = job.data;

            const settings = await this.companySettingsService.getOrCreate(companyId, locationId);
            const mapped = this.companySettingsService.mapGet(settings);

            await this.whatsAppService.send(
                {
                    whatsapp_enabled: mapped.whatsapp_enabled,
                    whatsapp_provider: mapped.whatsapp_provider,
                    whatsapp_api_key: mapped.whatsapp_api_key,
                    whatsapp_api_secret: mapped.whatsapp_api_secret,
                    whatsapp_from_number: mapped.whatsapp_from_number,
                },
                to,
                body,
            );
        } catch (error) {
            this.logger.error(`WhatsApp job ${job.id} failed: ${error.message}`);
            throw error;
        }
    }
}
