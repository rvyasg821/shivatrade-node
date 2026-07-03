import {
    Body,
    Controller,
    Get,
    InternalServerErrorException,
    Param,
    Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import { DatabaseService } from '@common/database/services/database.service';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import { Response } from '@common/response/decorators/response.decorator';

import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { IUnifiedAuthJwtAccessTokenPayload } from '@modules/auth/interfaces/auth.unified.interface';
import { ENUM_USER_TYPE } from '@common/enums/user-type.enum';
import {
    AuthMeAdminDoc,
    AuthAdminUpdatePasswordDoc,
    AuthAdminUpdateProfileDoc,
} from '@modules/auth/docs/auth.admin.doc';
import { AuthService } from '@modules/auth/services/auth.service';
import { ENUM_PASSWORD_HISTORY_TYPE } from '@modules/password-history/enums/password-history.enum';
import { PasswordHistoryService } from '@modules/password-history/services/password-history.service';
import { UserProtected } from '@modules/user/decorators/user.decorator';
import { UserNotSelfPipe } from '@modules/user/pipes/user.not-self.pipe';
import { UserParsePipe } from '@modules/user/pipes/user.parse.pipe';
import { UserDoc } from '@modules/user/repository/entities/user.entity';
import { UserService } from '@modules/user/services/user.service';
import { NodemailerService } from '@modules/email/services/nodemailer.service';
import { APP_NAME } from '@app/constants/app.constant';
import { AuthUpdateProfileRequestDto } from '../dtos/request/auth.update-profile.request.dto';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { CompanyService } from '@modules/company/services/company.service';
import { RoleService } from '@modules/role/services/role.service';
import { FileService } from '@common/file/services/file.service';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import { ToolsService } from '@modules/tools/services/tools.service';

@ApiTags('modules.admin.auth')
@Controller({
    version: '1',
    path: '/auth',
})
export class AuthAdminController {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly authService: AuthService,
        private readonly userService: UserService,
        private readonly nodemailerService: NodemailerService,
        private readonly passwordHistoryService: PasswordHistoryService,
        private readonly companyService: CompanyService,private readonly fileService: FileService,
        private readonly subscriptionService: SubscriptionService,
        private readonly toolsService: ToolsService,) { }

    @AuthAdminUpdatePasswordDoc()
    @Response('auth.updatePassword')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/update/:user/password')
    async updatePassword(
        @AuthJwtPayload('user') updatedBy: string,
        @Param('user', RequestRequiredPipe, UserParsePipe, UserNotSelfPipe)
        user: UserDoc
    ): Promise<void> {
        // const session: ClientSession = await this.databaseService.createTransaction();

        try {
            const passwordString = this.authService.createPasswordRandom();
            const password = this.authService.createPassword(passwordString, {
                temporary: true,
            });

            user = await this.userService.updatePassword(user, password);
            user = await this.userService.resetPasswordAttempt(user);

            await this.passwordHistoryService.createByAdmin(
                user,
                {
                    by: updatedBy,
                    type: ENUM_PASSWORD_HISTORY_TYPE.TEMPORARY,
                },
                { actionBy: updatedBy }
            );

            // await this.databaseService.commitTransaction(session);

            await this.nodemailerService.sendEmail(
                user.email,
                'Your Password updated',
                `Hi ${user?.name}\nYour password is ${passwordString} Expired At ${password.passwordExpired}.\n\nThank you,\n${APP_NAME}`
            );

            return;
        } catch (err: unknown) {
            // await this.databaseService.abortTransaction(session);

            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @AuthMeAdminDoc()
    @Response('auth.me')
    // @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/me')
    async me(@AuthJwtPayload() jwtPayload: IUnifiedAuthJwtAccessTokenPayload) {
        try {
            const { user: userId, userType, tenantId } = jwtPayload;
            let userData = null;

            // Route to appropriate user data fetching based on user type
            // Handle case where userType is undefined (legacy tokens / cross-login)
            switch (userType) {
                case ENUM_USER_TYPE.ADMIN:
                case ENUM_USER_TYPE.COMPANY_ADMIN:
                    userData =
                        await this.getSuperAdminOrCompanyAdminProfile(userId);
                    break;

                case ENUM_USER_TYPE.TENANT_USER:
                    // Tenant users (Employee, Location Admin) are now in the central database
                    userData =
                        await this.getSuperAdminOrCompanyAdminProfile(userId);
                    break;

                default:
                    // Handle legacy tokens or cross-login tokens without userType
                    // Try to fetch as Company Admin (most common case for cross-login)
                    userData =
                        await this.getSuperAdminOrCompanyAdminProfile(userId);
                    break;
            }

            // Add user type and tenant context to response
            if (userData) {
                userData.userType = userType || ENUM_USER_TYPE.COMPANY_ADMIN;
                userData.tenantId = tenantId;
            }

            return {
                data: userData,
            };
        } catch (err: unknown) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    /**
     * Get Super Admin or Company Admin profile from master database
     */
    private async getSuperAdminOrCompanyAdminProfile(
        userId: string
    ): Promise<any> {
        const user = await this.userService.findOneById(userId, { join: true });
        if (!user) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'user.error.notFound',
            });
        }

        // Check if user is a company admin with company details
        // First try by user_id (works for Company Admin who owns the company)
        let company = await this.companyService.findOneByUserId(user._id);

        // If not found and user has companyId, find company by ID (for Location Admin, Employee, etc.)
        if (!company && user.companyId) {
            try {
                company = await this.companyService.findOneById(user.companyId);
            } catch (e) {
                // Company not found by companyId
            }
        }

        const userRole: any = user.role;

        // Only Super Admin and Agent are system users
        const isSystemUser = userRole?.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN;
        if (company) {
            // Use company admin's user_id for subscription lookup (works for both Company Admin and Tenant Users)
            const subscriptionUserId = company.user_id ? String(company.user_id) : user._id?.toString();
            const subscription = await this.subscriptionService.findActiveByUserId(subscriptionUserId);
            const hasActiveSubscription = !!subscription;
            // Single-tenant: expose ALL active tools (no tool-based access).
            const tools = await this.toolsService.resolveExposedTools(
                subscription ? subscription.tools : []
            );
            const helpdeskTool = await this.toolsService.findOne({ slug: 'helpdesk-support-ticket' });
            if (helpdeskTool) {
                const isToolExists = tools.find((tool) => tool?._id.toString() === helpdeskTool._id.toString());
                if (!isToolExists) {
                    delete userRole.permissions.helpdesk_ticket;
                }
            }
            // Attach tools to company so frontend can read company.tools
            const companyWithTools = company ? { ...((company as any).toJSON ? (company as any).toJSON() : company), tools } : null;

            return {
                ...user,
                _id: user._id,
                name: user.name,
                email: user.email,
                country_code: user.country_code,
                mobile: user.mobile,
                role: user.role,
                gender: user.gender,
                status: user.status,
                createdAt: user.createdAt,
                first_name: user.first_name,
                last_name: user.last_name,
                tenantId: company?.tenantId,
                company: companyWithTools,
                isSystemUser: false,
                photo: user.photo,
                hasActiveSubscription: hasActiveSubscription,
            };
        } else {
            return {
                ...user,
                _id: user._id,
                name: user.name,
                email: user.email,
                country_code: user.country_code,
                mobile: user.mobile,
                role: user.role,
                gender: user.gender,
                status: user.status,
                createdAt: user.createdAt,
                first_name: user.first_name,
                last_name: user.last_name,
                isSystemUser: isSystemUser,
                photo: user.photo,
                hasActiveSubscription: true, // Super Admin always has access
            };
        }
    }

    /**
     * Get Tenant User profile - REMOVED: Multi-tenant feature removed
     * Tenant users are no longer supported
     */
    private async getTenantUserProfile(
        userId: string,
        tenantId: string
    ): Promise<any> {
        throw new InternalServerErrorException({
            statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
            message: 'Tenant users not supported - multi-tenant feature removed',
        });
    }

    /**
     * Update Master User (Admin/Company Admin) profile in master database
     */
    private async updateMasterUserProfile(
        userId: string,
        updateData: AuthUpdateProfileRequestDto
    ): Promise<any> {
        try {
            let user = await this.userService.findOneById(userId);
            if (!user) {
                throw new InternalServerErrorException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'user.error.notFound',
                });
            }

            const currentUserPhoto = user?.photo;
            let isPhotoUpdated = false;
            if (updateData.photo) {
                try {
                    const uploadedPhoto = await this.uploadBase64Image(updateData.photo, user._id.toString());
                    if (uploadedPhoto) {
                        updateData.photo = uploadedPhoto;
                        isPhotoUpdated = true;
                    }
                } catch (error) {
                    updateData.photo = currentUserPhoto;
                    isPhotoUpdated = false;
                }
            }

            // Update user profile in master database
            await this.userService.updateProfile(user, {
                ...updateData,
                name: `${updateData.first_name} ${updateData.last_name}`,
            } as AuthUpdateProfileRequestDto);

            if (isPhotoUpdated && currentUserPhoto) {
                try {
                    const currentUserPhotoPath = `public` + currentUserPhoto.split('assets')[1];
                    await this.fileService.deleteFile(currentUserPhotoPath);
                } catch (error) { }
            }
            // Fetch updated user with role information
            user = await this.userService.findOneById(userId, { join: true });

            const company = await this.companyService.findOneByUserId(userId);

            // Check subscription status
            let hasActiveSubscription = true; // Default for Super Admin
            if (company) {
                const subscription = await this.subscriptionService.findActiveByUserId(userId);
                hasActiveSubscription = !!subscription;
            }

            const userRole: any = user.role;
            const isSystemUserFlag = userRole?.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN;

            return {
                ...user,
                _id: user._id,
                name: `${user.first_name} ${user.last_name}`,
                email: user.email,
                country_code: user.country_code,
                mobile: user.mobile,
                role: user.role,
                gender: user.gender,
                status: user.status,
                createdAt: user.createdAt,
                first_name: user.first_name,
                last_name: user.last_name,
                company: company,
                isSystemUser: isSystemUserFlag,
                photo: user?.photo ?? null,
                hasActiveSubscription: hasActiveSubscription,
            };
        } catch (error) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'user.error.masterProfileUpdateFailed',
                _error: error,
            });
        }
    }

    private async uploadBase64Image(imageBase64: string, fileName: string): Promise<string> {
        try {
            const response = await this.fileService.uploadBase64Image(imageBase64, fileName);
            return response;
        } catch (error) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'user.error.base64ImageUploadFailed',
                _error: error,
            });
        }
    }
    /**
     * Update Tenant User profile - REMOVED: Multi-tenant feature removed
     * Tenant users are no longer supported
     */
    private async updateTenantUserProfile(
        userId: string,
        tenantId: string,
        updateData: AuthUpdateProfileRequestDto
    ): Promise<any> {
        throw new InternalServerErrorException({
            statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
            message: 'Tenant users not supported - multi-tenant feature removed',
        });
    }

    @AuthAdminUpdateProfileDoc()
    @Response('auth.updateProfile')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/update-profile')
    async updateProfile(
        @Body() body: AuthUpdateProfileRequestDto,
        @AuthJwtPayload() jwtPayload: IUnifiedAuthJwtAccessTokenPayload
    ): Promise<any> {
        try {
            const { user: userId, userType, tenantId } = jwtPayload;

            // All user types are now in the central users table
            const userData = await this.updateMasterUserProfile(userId, body);

            // Add user type and tenant context to response
            if (userData) {
                userData.userType = userType;
                userData.tenantId = tenantId;
            }

            return {
                data: userData,
            };
        } catch (err: any) {
            console.error('[UpdateProfile] Error:', err?.message, err?.stack);
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: err?.message || 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }
}
