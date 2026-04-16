import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { EmailTemplateService } from '@modules/email/services/email.template.service';

@Injectable()
export class MigrationTemplateSeed {
    constructor(
        private readonly emailTemplateService: EmailTemplateService,
    ) {}

    @Command({
        command: 'migrate:emailTemplate',
        describe: 'migrate email templates',
    })
    async migrateEmail(): Promise<void> {
        try {
            await this.emailTemplateService.importWelcome();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.importCreate();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.importChangePassword();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.importTempPassword();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.importResetPassword();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.importVerification();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.importEmailVerified();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.importMobileNumberVerified();
        } catch (err: any) {
            throw new Error(err);
        }

        return;
    }

    @Command({
        command: 'rollback:emailTemplate',
        describe: 'rollback email templates',
    })
    async rollbackEmail(): Promise<void> {
        try {
            await this.emailTemplateService.deleteWelcome();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.deleteCreate();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.deleteChangePassword();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.deleteTempPassword();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.deleteResetPassword();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.deleteVerification();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.deleteEmailVerified();
        } catch (err: any) {
            throw new Error(err);
        }

        try {
            await this.emailTemplateService.deleteMobileNumberVerified();
        } catch (err: any) {
            throw new Error(err);
        }

        return;
    }
}