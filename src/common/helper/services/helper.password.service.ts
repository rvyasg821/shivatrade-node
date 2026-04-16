import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HelperHashService } from '@common/helper/services/helper.hash.service';
import { HelperDateService } from '@common/helper/services/helper.date.service';
import { IAuthPassword, IAuthPasswordOptions } from '@modules/auth/interfaces/auth.interface';

@Injectable()
export class HelperPasswordService {
    private readonly passwordExpiredIn: number;
    private readonly passwordExpiredTemporary: number;
    private readonly passwordSaltLength: number;

    constructor(
        private readonly helperHashService: HelperHashService,
        private readonly helperDateService: HelperDateService,
        private readonly configService: ConfigService
    ) {
        this.passwordExpiredIn = this.configService.get<number>(
            'auth.password.expiredIn'
        );
        this.passwordExpiredTemporary = this.configService.get<number>(
            'auth.password.expiredInTemporary'
        );
        this.passwordSaltLength = this.configService.get<number>(
            'auth.password.saltLength'
        );
    }

    createSalt(length: number): string {
        return this.helperHashService.randomSalt(length);
    }

    createPassword(
        password: string,
        options?: IAuthPasswordOptions
    ): IAuthPassword {
        const salt: string = this.createSalt(this.passwordSaltLength);

        const today = this.helperDateService.create();
        const passwordExpired: Date = this.helperDateService.forward(
            today,
            this.helperDateService.createDuration({
                seconds: options?.temporary
                    ? this.passwordExpiredTemporary
                    : this.passwordExpiredIn,
            })
        );
        const passwordCreated: Date = this.helperDateService.create();
        const passwordHash = this.helperHashService.bcrypt(password, salt);
        return {
            passwordHash,
            passwordExpired,
            passwordCreated,
            salt,
        };
    }

    checkPasswordExpired(passwordExpired: Date): boolean {
        const today: Date = this.helperDateService.create();
        const passwordExpiredConvert: Date =
            this.helperDateService.create(passwordExpired);

        return today > passwordExpiredConvert;
    }
}