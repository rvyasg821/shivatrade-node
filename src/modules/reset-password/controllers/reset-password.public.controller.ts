import {
    BadRequestException,
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    InternalServerErrorException,
    NotFoundException,
    Param,
    Post,
    Logger,
} from '@nestjs/common';

import { UserService } from '@modules/user/services/user.service';
import { ApiTags } from '@nestjs/swagger';
import { IResponse } from '@common/response/interfaces/response.interface';
import {
    ResetPasswordPublicGetDoc,
    ResetPasswordPublicRequestDoc,
    ResetPasswordPublicResetDoc,
    ResetPasswordPublicVerifyDoc,
} from '@modules/reset-password/docs/reset-password.public.doc';
import { ResetPasswordCreateRequestDto } from '@modules/reset-password/dtos/request/reset-password.create.request.dto';
import { ENUM_USER_STATUS_CODE_ERROR } from '@modules/user/enums/user.status-code.enum';
import { ResetPasswordService } from '@modules/reset-password/services/reset-password.service';
import { ResetPasswordCreteResponseDto } from '@modules/reset-password/dtos/response/reset-password.create.response.dto';
import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import { IResetPasswordRequest } from '@modules/reset-password/interfaces/reset-password.interface';

import { Response } from '@common/response/decorators/response.decorator';
import { PasswordHistoryService } from '@modules/password-history/services/password-history.service';
import { ResetPasswordParseByTokenPipe } from '@modules/reset-password/pipes/reset-password.parse.pipe';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import { ResetPasswordActivePipe } from '@modules/reset-password/pipes/reset-password.active.pipe';
import { ResetPasswordExpiredPipe } from '@modules/reset-password/pipes/reset-password.expired.pipe';
import { ResetPasswordDoc } from '@modules/reset-password/repository/entities/reset-password.entity';
import { ENUM_RESET_PASSWORD_STATUS_CODE_ERROR } from '@modules/reset-password/enums/reset-password.status-code.enum';
import { ResetPasswordResetRequestDto } from '@modules/reset-password/dtos/request/reset-password.reset.request.dto';
import { AuthService } from '@modules/auth/services/auth.service';
import { IAuthPassword } from '@modules/auth/interfaces/auth.interface';
import { ENUM_PASSWORD_HISTORY_TYPE } from '@modules/password-history/enums/password-history.enum';
import { ResetPasswordVerifyRequestDto } from '@modules/reset-password/dtos/request/reset-password.verify.request.dto';
import { DatabaseService } from '@common/database/services/database.service';
import { NodemailerService } from '@modules/email/services/nodemailer.service';
import { APP_NAME, APP_FRONTEND_URL } from '@app/constants/app.constant';

@ApiTags('modules.public.resetPassword')
@Controller({
    version: '1',
    path: '/reset-password',
})
export class ResetPasswordPublicController {
    private readonly logger = new Logger(ResetPasswordPublicController.name);

    constructor(
        private readonly databaseService: DatabaseService,
        private readonly userService: UserService,
        private readonly passwordHistoryService: PasswordHistoryService,
        private readonly authService: AuthService,
        private readonly nodemailerService: NodemailerService,
        private readonly resetPasswordService: ResetPasswordService,
    ) {}

    // ============ REQUEST — Forgot Password ============

    @ResetPasswordPublicRequestDoc()
    @Response('resetPassword.request')
    @HttpCode(HttpStatus.OK)
    @Post('/request')
    async request(
        @Body() { email }: ResetPasswordCreateRequestDto
    ): Promise<any> {
        this.logger.log(`Password reset request for: ${email?.substring(0, 3)}***`);

        // Look up user directly from users table
        const user = await this.userService.findOneByEmail(email);
        if (!user || (user as any).deleted) {
            throw new BadRequestException({
                statusCode: ENUM_USER_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'user.error.notFound',
            });
        }

        const userId = String(user._id);
        const userName = (user as any)?.name || (user as any)?.first_name || 'user';

        // Check for existing active reset request
        const checkLatest: any =
            await this.resetPasswordService.checkActiveLatestEmailByUser(userId);
        if (checkLatest) {
            return { data: checkLatest.created };
        }

        try {
            // Deactivate any existing reset requests
            await this.resetPasswordService.inactiveEmailManyByUser(userId);

            // Create new reset password request
            const resetPassword =
                await this.resetPasswordService.requestEmailByUser(userId, { email });

            // Send forgot password email
            try {
                const OTP = resetPassword?.resetPassword?.otp || 'N/A';
                const context = {
                    name: userName,
                    appName: APP_NAME,
                    text: {
                        email,
                        content: { name: userName, otp: OTP, expiresIn: 10 },
                        footer: true,
                    },
                    link: `${APP_FRONTEND_URL}/${resetPassword.created?.url}`,
                    expiresIn: 5,
                };
                await this.nodemailerService.sendEmailWithTemplate(email, 'Reset Password request', 'forgot_password.hjs', context);
            } catch (err) {
                this.logger.warn(`Failed to send reset password email: ${err?.message}`);
            }

            return { data: resetPassword.created };
        } catch (err: unknown) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    // ============ GET — Validate Reset Token ============

    @ResetPasswordPublicGetDoc()
    @Response('resetPassword.get')
    @HttpCode(HttpStatus.OK)
    @Post('/get/:token')
    async get(
        @Param('token', RequestRequiredPipe, ResetPasswordParseByTokenPipe, ResetPasswordActivePipe, ResetPasswordExpiredPipe)
        resetPassword: ResetPasswordDoc
    ): Promise<any> {
        const user = await this.userService.findOneById(resetPassword.user);
        if (!user || (user as any).deleted) {
            throw new NotFoundException({
                statusCode: ENUM_USER_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'user.error.notFound',
            });
        }

        const mapped = this.resetPasswordService.mapResetPasswordResponse(
            resetPassword,
            { email: user.email }
        );

        return { data: mapped };
    }

    // ============ VERIFY — Verify OTP ============

    @ResetPasswordPublicVerifyDoc()
    @Response('resetPassword.verify')
    @HttpCode(HttpStatus.OK)
    @Post('/verify/:token')
    async verify(
        @Param('token', RequestRequiredPipe, ResetPasswordParseByTokenPipe, ResetPasswordActivePipe, ResetPasswordExpiredPipe)
        resetPassword: ResetPasswordDoc,
        @Body() { otp }: ResetPasswordVerifyRequestDto
    ): Promise<void> {
        const user = await this.userService.findOneById(resetPassword.user);
        if (!user || (user as any).deleted) {
            throw new NotFoundException({
                statusCode: ENUM_USER_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'user.error.notFound',
            });
        }

        // Verify OTP
        if (resetPassword.otp !== otp) {
            throw new BadRequestException({
                statusCode: ENUM_RESET_PASSWORD_STATUS_CODE_ERROR.OTP_NOT_MATCH,
                message: 'resetPassword.error.invalidOtp',
            });
        }

        await this.resetPasswordService.verify(resetPassword);
    }

    // ============ RESET — Set New Password ============

    @ResetPasswordPublicResetDoc()
    @Response('resetPassword.reset')
    @HttpCode(HttpStatus.OK)
    @Post('/reset/:token')
    async reset(
        @Param('token', RequestRequiredPipe, ResetPasswordParseByTokenPipe, ResetPasswordActivePipe, ResetPasswordExpiredPipe)
        resetPassword: ResetPasswordDoc,
        @Body() { newPassword }: ResetPasswordResetRequestDto
    ): Promise<void> {
        let user = await this.userService.findOneById(resetPassword.user);
        if (!user || (user as any).deleted) {
            throw new NotFoundException({
                statusCode: ENUM_USER_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'user.error.notFound',
            });
        }

        const userEmail = user.email;
        const userName = (user as any)?.name || (user as any)?.first_name || 'user';

        try {
            // Create password hash and update user
            const password: IAuthPassword = this.authService.createPassword(newPassword);
            user = await this.userService.updatePassword(user, password);

            // Create password history
            await this.passwordHistoryService.createByUser(user, {
                type: ENUM_PASSWORD_HISTORY_TYPE.FORGOT,
            });

            // Mark reset password as completed
            await this.resetPasswordService.reset(resetPassword);

            // Send confirmation email
            try {
                await this.nodemailerService.sendEmailWithTemplate(
                    userEmail,
                    'Your password successfully reset',
                    'changed_password.hjs',
                    { name: userName, email: userEmail }
                );
            } catch (err) {
                this.logger.warn(`Failed to send password changed email: ${err?.message}`);
            }

            this.logger.log(`Password reset completed for: ${userEmail?.substring(0, 3)}***`);
        } catch (err: unknown) {
            this.logger.error(`Password reset failed for token: ${resetPassword.token}`, err);
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }
}
