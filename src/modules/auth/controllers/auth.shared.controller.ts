import {
    BadRequestException,
    Body,
    Controller,
    ForbiddenException,
    HttpCode,
    HttpStatus,
    InternalServerErrorException,
    Patch,
    Post,
    Res,
    UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
    AuthJwtRefreshProtected,
    AuthJwtToken,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { AuthService } from '@modules/auth/services/auth.service';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';
import { ENUM_USER_STATUS_CODE_ERROR } from '@modules/user/enums/user.status-code.enum';
import { UserService } from '@modules/user/services/user.service';
import { AuthRefreshResponseDto } from '@modules/auth/dtos/response/auth.refresh.response.dto';
import { AuthChangePasswordRequestDto } from '@modules/auth/dtos/request/auth.change-password.request.dto';
import {
    AuthSharedChangePasswordDoc,
    AuthSharedRefreshDoc,
} from '@modules/auth/docs/auth.shared.doc';
import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import { ENUM_PASSWORD_HISTORY_TYPE } from '@modules/password-history/enums/password-history.enum';
import { PasswordHistoryService } from '@modules/password-history/services/password-history.service';
import { SessionService } from '@modules/session/services/session.service';
import { ENUM_SESSION_STATUS_CODE_ERROR } from '@modules/session/enums/session.status-code.enum';
import { ActivityService } from '@modules/activity/services/activity.service';
import { MessageService } from '@common/message/services/message.service';
import { IUserDoc } from '@modules/user/interfaces/user.interface';
import { UserProtected } from '@modules/user/decorators/user.decorator';
import { DatabaseService } from '@common/database/services/database.service';
import {
    IAuthJwtAccessTokenPayload,
    IAuthJwtRefreshTokenPayload,
} from '@modules/auth/interfaces/auth.interface';
import { NodemailerService } from '@modules/email/services/nodemailer.service';
import { APP_NAME } from '@app/constants/app.constant';
import { CompanyService } from '@modules/company/services/company.service';
import { Response as ExpressResponse } from 'express';
@ApiTags('modules.shared.auth')
@Controller({
    version: '1',
    path: '/auth',
})
export class AuthSharedController {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly userService: UserService,
        private readonly authService: AuthService,
        private readonly passwordHistoryService: PasswordHistoryService,
        private readonly sessionService: SessionService,
        private readonly activityService: ActivityService,
        private readonly nodemailerService: NodemailerService,
        private readonly messageService: MessageService,
        private readonly companyService: CompanyService,
    ) {}

    @AuthSharedRefreshDoc()
    @Response('auth.refresh')
    @UserProtected()
    @AuthJwtRefreshProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/refresh')
    async refresh(
        @AuthJwtToken() refreshToken: string,
        @AuthJwtPayload<IAuthJwtRefreshTokenPayload>()
        { user: userFromPayload, session }: IAuthJwtRefreshTokenPayload
    ): Promise<IResponse<AuthRefreshResponseDto>> {
        const checkActive = await this.sessionService.findLoginSession(session);
        if (!checkActive) {
            throw new UnauthorizedException({
                statusCode: ENUM_SESSION_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'session.error.notFound',
            });
        }

        const user: IUserDoc =
            await this.userService.findOneActiveById(userFromPayload);

        // Fetch company information for the user
        let companyId = '';
        try {
            let company = await this.companyService.findOneByUserId(user._id);
            // Fallback: use user's companyId for Employee/Location Admin who don't own a company
            if (!company && (user as any).companyId) {
                company = await this.companyService.findOneById((user as any).companyId);
            }
            if (company) {
                companyId = String(company._id);
            }
        } catch (error) {
            // If company not found, keep companyId empty
        }

        const token = await this.authService.refreshToken(
            user,
            refreshToken,
            companyId
        );

        return {
            data: token,
        };
    }

    @AuthSharedChangePasswordDoc()
    @Response('auth.changePassword')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Patch('/change-password')
    async changePassword(
        @Body() body: AuthChangePasswordRequestDto,
        @AuthJwtPayload<IAuthJwtAccessTokenPayload>('user')
        userFromPayload: string,
        @AuthJwtPayload<IAuthJwtAccessTokenPayload>('email')
        userEmailFromPayload: string,
        @AuthJwtPayload<IAuthJwtAccessTokenPayload>()
        userPayloadToken: IAuthJwtAccessTokenPayload
        // @Res({ passthrough: true }) res: ExpressResponse
    ): Promise<void> {
        // All users are in the central database
        {
            let user =
                await this.userService.findOneByIdWithPassword(userFromPayload);

            const matchPassword = this.authService.validateUser(
                body.oldPassword,
                user.password
            );
            if (!matchPassword) {
                await this.userService.increasePasswordAttempt(user);

                throw new BadRequestException({
                    statusCode: ENUM_USER_STATUS_CODE_ERROR.PASSWORD_NOT_MATCH,
                    message: 'auth.error.passwordNotMatch',
                });
            }

            await this.userService.resetPasswordAttempt(user);

            const password = this.authService.createPassword(body.newPassword);
            // const checkPassword = await this.passwordHistoryService.findOneUsedByUser(
            //     user._id,
            //     body.newPassword
            // );
            // if (checkPassword) {
            //     const passwordPeriod = await this.passwordHistoryService.getPasswordPeriod();
            //     throw new BadRequestException({
            //         statusCode: ENUM_USER_STATUS_CODE_ERROR.PASSWORD_MUST_NEW,
            //         message: 'auth.error.passwordMustNew',
            //         _metadata: {
            //             customProperty: {
            //                 messageProperties: {
            //                     period: passwordPeriod,
            //                 },
            //             },
            //         },
            //     });
            // }

            // const session: ClientSession = await this.databaseService.createTransaction();

            user = await this.userService.updatePassword(user, password);

            await this.passwordHistoryService.createByUser(user, {
                type: ENUM_PASSWORD_HISTORY_TYPE.CHANGE,
            });
            await this.activityService.createByUser(user, {
                description: this.messageService.setMessage(
                    'activity.user.changePassword'
                ),
            });
            await this.sessionService.updateManyRevokeByUser(user._id);


            // await this.databaseService.commitTransaction(session);

            // await this.nodemailerService.sendEmail(
            //     user.email,
            //     "Your Password updated",
            //     `Hi ${user?.name}\nPassword changed successfully.\n\nThank you,\n${APP_NAME}`,
            // );

            try {
                const subject = 'Your password Changed successfully';
                const context = { 
                    name: user?.name ?? 'User',
                    email: user.email,
                };
                
                    await this.nodemailerService.sendEmailWithTemplate(user.email, subject, 'changed_password.hjs', context);
            } catch (error) {}

            // // res.status(200).json({ success: true, statusCode: 200, message: "Password changed successfully." })
            // return;
        }
    }
}
