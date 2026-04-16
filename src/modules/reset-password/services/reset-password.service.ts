import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HelperNumberService } from '@common/helper/services/helper.number.service';
import { HelperStringService } from '@common/helper/services/helper.string.service';
import { ResetPasswordRepository } from '@modules/reset-password/repository/repositories/reset-password.repository';
import { ResetPasswordDoc, ResetPasswordEntity } from '@modules/reset-password/repository/entities/reset-password.entity';
import { ENUM_RESET_PASSWORD_TYPE } from '@modules/reset-password/enums/reset-password.enum';

@Injectable()
export class ResetPasswordService {
    private readonly logger = new Logger(ResetPasswordService.name);
    private readonly expiredInMinutes: number;
    private readonly otpLength: number;
    private readonly tokenLength: number;

    constructor(
        private readonly resetPasswordRepository: ResetPasswordRepository,
        private readonly helperNumberService: HelperNumberService,
        private readonly helperStringService: HelperStringService,
        private readonly configService: ConfigService,
    ) {
        this.expiredInMinutes = this.configService.get<number>('resetPassword.expiredInMinutes') || 10;
        this.otpLength = this.configService.get<number>('resetPassword.otpLength') || 6;
        this.tokenLength = this.configService.get<number>('resetPassword.tokenLength') || 16;
    }

    /**
     * Check if there is an active reset request for a user
     */
    async checkActiveLatestEmailByUser(userId: string): Promise<any> {
        try {
            const existing = await this.resetPasswordRepository.findOne({
                user: userId,
                type: ENUM_RESET_PASSWORD_TYPE.EMAIL,
                isActive: true,
                isReset: false,
            });

            if (!existing) return null;

            // Check if expired
            if (new Date() > existing.expiredDate) {
                // Mark as inactive
                await this.resetPasswordRepository.update(existing, { isActive: false });
                return null;
            }

            return {
                created: {
                    token: existing.token,
                    url: `reset-password/${existing.token}`,
                    expiredDate: existing.expiredDate,
                    to: existing.to,
                },
            };
        } catch {
            return null;
        }
    }

    /**
     * Deactivate all existing reset requests for a user
     */
    async inactiveEmailManyByUser(userId: string): Promise<void> {
        try {
            const items = await this.resetPasswordRepository.findAll({
                user: userId,
                type: ENUM_RESET_PASSWORD_TYPE.EMAIL,
                isActive: true,
            }) as ResetPasswordEntity[];

            for (const item of items) {
                await this.resetPasswordRepository.update(item, { isActive: false });
            }
        } catch {}
    }

    /**
     * Create a new reset password request
     */
    async requestEmailByUser(userId: string, { email }: { email: string }): Promise<any> {
        const otp = this.helperNumberService.random(this.otpLength);
        const token = this.helperStringService.random(this.tokenLength);
        const expiredDate = new Date(Date.now() + this.expiredInMinutes * 60 * 1000);
        const reference = `RP-${this.helperStringService.random(8).toUpperCase()}`;

        const created = await this.resetPasswordRepository.create({
            user: userId,
            to: email,
            otp: String(otp),
            token,
            type: ENUM_RESET_PASSWORD_TYPE.EMAIL,
            expiredDate,
            isActive: true,
            isReset: false,
            reference,
        });

        return {
            resetPassword: created as ResetPasswordEntity,
            created: {
                token,
                url: `reset-password/${token}`,
                expiredDate,
                to: email,
                otp: String(otp),
            },
        };
    }

    /**
     * Find one reset password record by token
     */
    async findOneByToken(token: string): Promise<ResetPasswordDoc | null> {
        return this.resetPasswordRepository.findOne({ token }) as Promise<ResetPasswordDoc | null>;
    }

    /**
     * Map reset password to response format
     */
    mapResetPasswordResponse(resetPassword: ResetPasswordDoc, extra?: { email?: string }): any {
        return {
            _id: resetPassword._id,
            token: resetPassword.token,
            type: resetPassword.type,
            expiredDate: resetPassword.expiredDate,
            isActive: resetPassword.isActive,
            isReset: resetPassword.isReset,
            email: extra?.email || resetPassword.to,
            url: `reset-password/${resetPassword.token}`,
        };
    }

    /**
     * Mark reset password as verified (OTP confirmed)
     */
    async verify(resetPassword: ResetPasswordDoc): Promise<void> {
        await this.resetPasswordRepository.update(resetPassword, {
            verifyDate: new Date(),
        });
    }

    /**
     * Mark reset password as completed (password changed)
     */
    async reset(resetPassword: ResetPasswordDoc): Promise<void> {
        await this.resetPasswordRepository.update(resetPassword, {
            isReset: true,
            isActive: false,
            resetDate: new Date(),
        });
    }

    /**
     * Check if a reset password token has expired
     */
    checkExpired(resetPassword: ResetPasswordDoc): boolean {
        return new Date() > resetPassword.expiredDate;
    }
}
