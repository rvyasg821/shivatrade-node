import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { EmailMobileNumberVerifiedDto } from '@modules/email/dtos/email.mobile-number-verified.dto';
import { EmailResetPasswordDto } from '@modules/email/dtos/email.reset-password.dto';
import { EmailSendDto } from '@modules/email/dtos/email.send.dto';
import { EmailTempPasswordDto } from '@modules/email/dtos/email.temp-password.dto';
import { EmailVerificationDto } from '@modules/email/dtos/email.verification.dto';
import { EmailVerifiedDto } from '@modules/email/dtos/email.verified.dto';
import { EmailWorkerDto } from '@modules/email/dtos/email.worker.dto';
import { ENUM_SEND_EMAIL_PROCESS } from '@modules/email/enums/email.enum';
import { IEmailProcessor } from '@modules/email/interfaces/email.processor.interface';
import { EmailService } from '@modules/email/services/email.service';
import { ENUM_WORKER_QUEUES } from '@workers/enums/worker.enum';
import { WorkerBase } from '@workers/bases/worker.base';

@Processor(ENUM_WORKER_QUEUES.EMAIL_QUEUE)
export class EmailProcessor extends WorkerBase implements IEmailProcessor {
    private readonly debug: boolean;
    private readonly logger = new Logger(EmailProcessor.name);

    constructor(
        private readonly emailService: EmailService,
        private readonly configService: ConfigService
    ) {
        super();

        this.debug = this.configService.get<boolean>('debug.enable');
    }

    async process(job: Job<EmailWorkerDto, any, string>): Promise<void> {
        try {
            const jobName = job.name;
            const companyId = job.data.companyId;
            const locationId = job.data.locationId;

            switch (jobName) {
                case ENUM_SEND_EMAIL_PROCESS.TEMPORARY_PASSWORD:
                    await this.processTempPassword(
                        job.data.send,
                        job.data.data as EmailTempPasswordDto,
                        companyId,
                        locationId
                    );

                    break;
                case ENUM_SEND_EMAIL_PROCESS.CHANGE_PASSWORD:
                    await this.processChangePassword(job.data.send, companyId, locationId);

                    break;
                case ENUM_SEND_EMAIL_PROCESS.WELCOME:
                    await this.processWelcome(job.data.send, companyId, locationId);

                    break;
                case ENUM_SEND_EMAIL_PROCESS.CREATE:
                    await this.processCreate(
                        job.data.send,
                        job.data.data as EmailTempPasswordDto,
                        companyId,
                        locationId
                    );

                    break;
                case ENUM_SEND_EMAIL_PROCESS.RESET_PASSWORD:
                    await this.processResetPassword(
                        job.data.send,
                        job.data.data as EmailResetPasswordDto,
                        companyId,
                        locationId
                    );

                    break;
                case ENUM_SEND_EMAIL_PROCESS.VERIFICATION:
                    await this.processVerification(
                        job.data.send,
                        job.data.data as EmailVerificationDto,
                        companyId,
                        locationId
                    );

                    break;
                case ENUM_SEND_EMAIL_PROCESS.EMAIL_VERIFIED:
                    await this.processEmailVerified(
                        job.data.send,
                        job.data.data as EmailVerifiedDto,
                        companyId,
                        locationId
                    );

                    break;
                case ENUM_SEND_EMAIL_PROCESS.MOBILE_NUMBER_VERIFIED:
                    await this.processMobileNumberVerified(
                        job.data.send,
                        job.data.data as EmailMobileNumberVerifiedDto,
                        companyId,
                        locationId
                    );

                    break;
                default:
                    break;
            }
        } catch (error: any) {
            if (this.debug) {
                this.logger.error(error);
            }
        }

        return;
    }

    async processWelcome(data: EmailSendDto, companyId?: string, locationId?: string): Promise<boolean> {
        return this.emailService.sendWelcome(data, companyId, locationId);
    }

    async processChangePassword(data: EmailSendDto, companyId?: string, locationId?: string): Promise<boolean> {
        return this.emailService.sendChangePassword(data, companyId, locationId);
    }

    async processTempPassword(
        data: EmailSendDto,
        tempPassword: EmailTempPasswordDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean> {
        return this.emailService.sendTempPassword(data, tempPassword, companyId, locationId);
    }

    async processCreate(
        data: EmailSendDto,
        tempPassword: EmailTempPasswordDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean> {
        return this.emailService.sendCreate(data, tempPassword, companyId, locationId);
    }

    async processResetPassword(
        data: EmailSendDto,
        resetPassword: EmailResetPasswordDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean> {
        return this.emailService.sendResetPassword(data, resetPassword, companyId, locationId);
    }

    async processVerification(
        data: EmailSendDto,
        resetPassword: EmailVerificationDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean> {
        return this.emailService.sendVerification(data, resetPassword, companyId, locationId);
    }

    async processEmailVerified(
        data: EmailSendDto,
        resetPassword: EmailVerifiedDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean> {
        return this.emailService.sendEmailVerified(data, resetPassword, companyId, locationId);
    }

    async processMobileNumberVerified(
        data: EmailSendDto,
        resetPassword: EmailMobileNumberVerifiedDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean> {
        return this.emailService.sendMobileNumberVerified(data, resetPassword, companyId, locationId);
    }
}
