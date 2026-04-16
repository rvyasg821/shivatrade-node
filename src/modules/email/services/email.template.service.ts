import { Injectable, Logger } from '@nestjs/common';
import { ENUM_SEND_EMAIL_PROCESS } from '@modules/email/enums/email.enum';
import { readFileSync } from 'fs';
import { GetTemplateCommandOutput } from '@aws-sdk/client-ses';

import { join } from 'path';
import { IEmailTemplateService } from '@modules/email/interfaces/email.template-service.interface';

@Injectable()
export class EmailTemplateService implements IEmailTemplateService {
    private readonly logger = new Logger(EmailTemplateService.name);

    constructor() {}

    async importChangePassword(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async getChangePassword(): Promise<GetTemplateCommandOutput> {
        return;
    }

    async deleteChangePassword(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async importWelcome(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async getWelcome(): Promise<GetTemplateCommandOutput> {
        return;
    }

    async deleteWelcome(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async importCreate(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async getCreate(): Promise<GetTemplateCommandOutput> {
        return;
    }

    async deleteCreate(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async importTempPassword(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async getTempPassword(): Promise<GetTemplateCommandOutput> {
        try {
            return;
        } catch (err: unknown) {
            this.logger.error(err);

            return;
        }
    }

    async deleteTempPassword(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async importResetPassword(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async getResetPassword(): Promise<GetTemplateCommandOutput> {
        return;
    }

    async deleteResetPassword(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async importVerification(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async getVerification(): Promise<GetTemplateCommandOutput> {
        return;
    }

    async deleteVerification(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async importEmailVerified(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async getEmailVerified(): Promise<GetTemplateCommandOutput> {
        return;
    }

    async deleteEmailVerified(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async importMobileNumberVerified(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }

    async getMobileNumberVerified(): Promise<GetTemplateCommandOutput> {
        return;
    }

    async deleteMobileNumberVerified(): Promise<boolean> {
        try {
            return true;
        } catch (err: unknown) {
            this.logger.error(err);

            return false;
        }
    }
}
