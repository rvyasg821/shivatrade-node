import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Delete,
    Get,
    InternalServerErrorException,
    NotFoundException,
    Param,
    Patch,
    Post,
    Put,
    Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaginationService } from '@common/pagination/services/pagination.service';
import {
    Response,
    ResponsePaging,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import {
    PaginationQuery,
    PaginationQueryFilterIn,
    PaginationQueryFilterInEnum,
} from '@common/pagination/decorators/pagination.decorator';

import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_ROLE_STATUS_CODE_ERROR } from '@modules/role/enums/role.status-code.enum';
import { IAuthPassword } from '@modules/auth/interfaces/auth.interface';
import { AuthService } from '@modules/auth/services/auth.service';

import {
    UserAdminCreateDoc,
    UserAdminGetDoc,
    UserAdminListDoc,
    UserAdminUpdateDoc,
    UserAdminUpdateStatusDoc,
    UserAdminDeleteDoc,
    UserAdminIsUserExistsDoc,
    UserAdminAgentCreateDoc,
    UserAgentValidReferalGetDoc,
} from '@modules/user/docs/user.admin.doc';
import {
    ENUM_USER_SIGN_UP_FROM,
    ENUM_USER_STATUS,
} from '@modules/user/enums/user.enum';
import { UserListResponseDto } from '@modules/user/dtos/response/user.list.response.dto';
import { UserParsePipe } from '@modules/user/pipes/user.parse.pipe';
import { UserProfileResponseDto } from '@modules/user/dtos/response/user.profile.response.dto';
import { UserService } from '@modules/user/services/user.service';
import {
    USER_DEFAULT_AVAILABLE_SEARCH,
    USER_DEFAULT_STATUS,
} from '@modules/user/constants/user.list.constant';
import { IUserDoc, IUserEntity } from '@modules/user/interfaces/user.interface';
import { UserDoc } from '@modules/user/repository/entities/user.entity';
import { UserCreateRequestDto } from '@modules/user/dtos/request/user.create.request.dto';
import { ENUM_USER_STATUS_CODE_ERROR } from '@modules/user/enums/user.status-code.enum';
import { UserNotSelfPipe } from '@modules/user/pipes/user.not-self.pipe';
import { UserUpdateRequestDto } from '@modules/user/dtos/request/user.update.request.dto';
import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import { PasswordHistoryService } from '@modules/password-history/services/password-history.service';
import { ENUM_PASSWORD_HISTORY_TYPE } from '@modules/password-history/enums/password-history.enum';
import { ActivityService } from '@modules/activity/services/activity.service';
import { MessageService } from '@common/message/services/message.service';
import { UserUpdateStatusRequestDto } from '@modules/user/dtos/request/user.update-status.request.dto';
import { UserProtected } from '@modules/user/decorators/user.decorator';
import { DatabaseService } from '@common/database/services/database.service';
import { NodemailerService } from '@modules/email/services/nodemailer.service';
import { APP_NAME } from '@app/constants/app.constant';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { isUserExistsRequestDto } from '../dtos/request/user.exists.request.dto';
import { UserHierarchyInsufficientLevelException } from '@common/exceptions/hierarchy.exception';
import { CompanyService } from '@modules/company/services/company.service';
import { name } from '@azure/msal-node/dist/packageMetadata';
import { UserAgentCreateRequestDto } from '../dtos/request/user_agent.create.request.dto';
import { EnhancedEmailService } from '@modules/email/services/enhanced-email.service';
import { FileService } from '@common/file/services/file.service';
import { FaceRecognitionService } from '@modules/attendance/services/face-recognition.service';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';

@ApiTags('modules.admin.user')
@Controller({
    version: '1',
    path: '/user',
})
export class UserAdminController {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly paginationService: PaginationService,
        private readonly roleService: RoleService,
        private readonly authService: AuthService,
        private readonly userService: UserService,
        private readonly passwordHistoryService: PasswordHistoryService,
        private readonly activityService: ActivityService,
        private readonly messageService: MessageService,
        private readonly nodemailerService: NodemailerService,
        private readonly emailService: EnhancedEmailService,
        private readonly companyService: CompanyService,
        private readonly fileService: FileService,
        private readonly faceRecognitionService: FaceRecognitionService,
        private readonly companySettingsService: CompanySettingsService
    ) {}

    @UserAdminListDoc()
    @ResponsePaging('user.list')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @PaginationQuery({
            availableSearch: USER_DEFAULT_AVAILABLE_SEARCH,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @PaginationQueryFilterInEnum(
            'status',
            USER_DEFAULT_STATUS,
            ENUM_USER_STATUS
        )
        status: Record<string, any>,
        @PaginationQueryFilterIn('role', null, true)
        role: Record<string, any>,
        @AuthJwtPayload('role') roleId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('roleLevel') currentUserLevel: number,
        @AuthJwtPayload('companyId') currentUserCompanyId: string,
        @AuthJwtPayload('locationId') locationIdFromToken: string,
        @Query('location_id') locationId?: string
    ): Promise<IResponsePaging<UserListResponseDto>> {
        const find: Record<string, any> = {
            ..._search,
            ...status,
            // Exclude current user from the list
            _id: { $ne: userId },
            // Apply hierarchy filtering - only show users at or below current user's level
            roleLevel: { $gte: currentUserLevel || 1 },
        };

        // Filter by location if provided from frontend
        if (locationId) {
            find.location_id = locationId;
        }

        // If role filter is provided in query params, use it
        if (role && Object.keys(role).length > 0) {
            find['role'] = role['role'];
        } else {
            // Otherwise, exclude Agent, Employee, Vendor, and Customer roles from the main users list
            const [agentRole, employeeRole, vendorRole, customerRole] = await Promise.all([
                this.roleService.findOne({ name: ENUM_SYSTEM_ROLE.AGENT }),
                this.roleService.findOne({ name: ENUM_SYSTEM_ROLE.EMPLOYEE }),
                this.roleService.findOne({ name: ENUM_SYSTEM_ROLE.VENDOR }),
                this.roleService.findOne({ name: ENUM_SYSTEM_ROLE.CUSTOMER }),
            ]);

            const excludeRoleIds = [agentRole?._id, employeeRole?._id, vendorRole?._id, customerRole?._id].filter(Boolean);
            if (excludeRoleIds.length > 0) {
                find['role'] = { $nin: excludeRoleIds };
            }
        }

        // Filter users by companyId and location based on role
        if (roleName === ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            // Super Admin only sees users without a company (system-level users)
            find.companyId = null;
            console.log('🔍 Super Admin user filter:', JSON.stringify(find));
        } else if (
            roleName === ENUM_SYSTEM_ROLE.COMPANY_ADMIN &&
            currentUserCompanyId
        ) {
            // Company Admin only sees users from their company
            find.companyId = currentUserCompanyId;
            console.log('🔍 Company Admin user filter:', JSON.stringify(find));
        } else if (
            roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN &&
            currentUserCompanyId
        ) {
            // Location Admin sees only users from their company AND their location
            find.companyId = currentUserCompanyId;
            // Force location filter from JWT (cannot be overridden by frontend)
            if (locationIdFromToken) {
                find.location_id = locationIdFromToken;
            }
            console.log('🔍 Location Admin user filter:', JSON.stringify(find));
        }

        const users: IUserEntity[] =
            await this.userService.findAllWithRoleAndCountry(find, {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            });

        console.log(`📋 Found ${users.length} users for role: ${roleName}`);
        if (users.length > 0 && users.length <= 5) {
            users.forEach(u => console.log(`   - ${u.name} (companyId: ${u['companyId']})`));
        }

        const total: number =
            await this.userService.getTotalWithRoleAndCountry(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        const mapped = this.userService.mapList(users);

        return {
            _pagination: { total, totalPage },
            data: mapped,
        };
    }

    @UserAdminIsUserExistsDoc()
    @Response('user.isUserExists')
    @Post('/isuserexists')
    async isUserExists(@Body() userBody: isUserExistsRequestDto): Promise<any> {
        try {
            const userExists = await this.userService.existByEmail(userBody.email);

            return { data: { userExists } };
        } catch (err: unknown) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @UserAdminListDoc()
    @ResponsePaging('user.getAgents')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/get/agents')
    async getAllAgents(
        @PaginationQuery({
            availableSearch: USER_DEFAULT_AVAILABLE_SEARCH,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @PaginationQueryFilterInEnum(
            'status',
            USER_DEFAULT_STATUS,
            ENUM_USER_STATUS
        )
        status: Record<string, any>,
        @PaginationQueryFilterIn('role', null, true)
        role: Record<string, any>,
        @AuthJwtPayload('role') roleId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('roleLevel') currentUserLevel: number
    ): Promise<IResponsePaging<UserListResponseDto>> {
        const find: Record<string, any> = {
            ..._search,
            ...status,
            // Exclude current user from the list
            _id: { $ne: userId },
            // Apply hierarchy filtering - only show users at or below current user's level
            roleLevel: { $gte: currentUserLevel || 1 },
        };

        const agentRole = await this.roleService.findOne({
            name: ENUM_SYSTEM_ROLE.AGENT,
        });

        if (!agentRole) {
            return {
                _pagination: { total: 0, totalPage: 0 },
                data: [],
            };
        }
        find.role = agentRole._id;

        const users: IUserEntity[] =
            await this.userService.findAllWithRoleAndCountry(find, {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            });

        const total: number =
            await this.userService.getTotalWithRoleAndCountry(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        const mapped = this.userService.mapList(users);

        return {
            _pagination: { total, totalPage },
            data: mapped,
        };
    }
    @UserAdminGetDoc()
    @Response('user.get')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/get/agent/:referalcode')
    async getAgent(
        @Param('referalcode', RequestRequiredPipe) referalcode: string
    ): Promise<IResponse<UserProfileResponseDto>> {
        const user: UserDoc =
            await this.userService.findOneByReferalCode(referalcode);
        const userWithRole: IUserDoc = await this.userService.join(user);
        const mapped: UserProfileResponseDto =
            this.userService.mapProfile(userWithRole);

        return { data: mapped };
    }

    @UserAgentValidReferalGetDoc()
    @Response('user.get')
    @Get('/agent/isvalid/:referalCode')
    async AgentExists(
        @Param('referalCode', RequestRequiredPipe) referalcode: string
    ): Promise<IResponse<any>> {
        const result: boolean =
            await this.userService.findOneActiveByReferalCode(referalcode);

        return {
            data: {
                isReferalCodeValid: result,
            },
        };
    }

    @UserAdminGetDoc()
    @Response('user.get')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/get/:user')
    async get(
        @Param('user', RequestRequiredPipe, UserParsePipe) user: UserDoc
    ): Promise<IResponse<UserProfileResponseDto>> {
        const userWithRole: IUserDoc = await this.userService.join(user);
        const mapped: UserProfileResponseDto =
            this.userService.mapProfile(userWithRole);

        return { data: mapped };
    }

    @UserAdminCreateDoc()
    @Response('user.create')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('user') createBy: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('roleLevel') currentUserLevel: number,
        @AuthJwtPayload('companyId') currentUserCompanyId: string,
        @Body()
        {
            email,
            password,
            role,
            name,
            first_name,
            last_name,
            gender,
            country_code,
            mobile,
            status,
            referal_code,
            commission,
            photo,
            location_id,
            accessible_locations,
            employee_code,
            designation,
            department,
            employment_type,
            date_of_joining,
            date_of_birth,
            reporting_to,
            address_line1,
            address_line2,
            city,
            state,
            postcode,
            country,
            face_image,
        }: UserCreateRequestDto
    ): Promise<IResponse<any>> {
        const promises: Promise<any>[] = [
            this.roleService.findOneById(role),
            this.userService.existByEmail(email),
        ];

        const [checkRole, emailExist] = await Promise.all(promises);

        if (!checkRole) {
            throw new NotFoundException({
                statusCode: ENUM_ROLE_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'role.error.notFound',
            });
        } else if (emailExist) {
            throw new ConflictException({
                statusCode: ENUM_USER_STATUS_CODE_ERROR.EMAIL_EXIST,
                message: 'user.error.emailExist',
            });
        }

        // Validate hierarchy - user can only assign roles at or above their level
        const targetRoleLevel = checkRole.level || 1;
        if (
            !this.userService.validateUserHierarchy(
                currentUserLevel || 1,
                targetRoleLevel
            )
        ) {
            throw new UserHierarchyInsufficientLevelException(
                currentUserLevel || 1,
                targetRoleLevel,
                'assign role to user'
            );
        }

        // Extract face descriptor if face_image is provided
        let faceDescriptor: number[] | null = null;
        let faceReferencePhoto: string | null = null;
        if (face_image) {
            try {
                const descriptor = await this.faceRecognitionService.extractDescriptor(face_image);
                faceDescriptor = Array.from(descriptor);
                faceReferencePhoto = await this.uploadBase64Image(face_image, `${Date.now()}-face-ref`);
            } catch (error) {
                if (error instanceof BadRequestException) {
                    throw error;
                }
                // Silently skip face registration on unexpected errors
            }
        }

        const passwordHash: IAuthPassword =
            this.authService.createPassword(password);
        if (photo) {
            try {
                const uploadedPhoto = await this.uploadBase64Image(
                    photo,
                    `${Date.now()}-user`
                );
                photo = uploadedPhoto;
            } catch (error) {
                photo = undefined;
            }
        }

        try {
            // Prepare user data with conditional companyId
            const userData: any = {
                email,
                role,
                first_name,
                last_name,
                gender,
                country_code,
                mobile,
                status: status || ENUM_USER_STATUS.ACTIVE,
                name:
                    first_name && last_name
                        ? `${first_name} ${last_name}`
                        : name,
                referal_code,
                commission: commission ?? 0,
                photo,
            };

            // Add employee fields if provided (service will handle conversions)
            if (location_id) userData.location_id = location_id;
            if (accessible_locations && Array.isArray(accessible_locations)) {
                userData.accessible_locations = accessible_locations;
            }
            // Employee-specific fields: only for Employee role
            const isEmployeeRole = checkRole?.name === ENUM_SYSTEM_ROLE.EMPLOYEE;
            if (isEmployeeRole) {
                if (employee_code) {
                    userData.employee_code = employee_code;
                } else if (userData.companyId || currentUserCompanyId) {
                    const autoCode = await this.companySettingsService.generateNextCode(
                        userData.companyId || currentUserCompanyId, 'employee'
                    );
                    if (autoCode) userData.employee_code = autoCode;
                }
                if (designation) userData.designation = designation;
                if (department) userData.department = department;
                if (employment_type) userData.employment_type = employment_type;
                if (date_of_joining) userData.date_of_joining = date_of_joining;
                if (date_of_birth) userData.date_of_birth = date_of_birth;
                if (reporting_to) userData.reporting_to = reporting_to;
            }
            if (address_line1) userData.address_line1 = address_line1;
            if (address_line2) userData.address_line2 = address_line2;
            if (city) userData.city = city;
            if (state) userData.state = state;
            if (postcode) userData.postcode = postcode;
            if (country) userData.country = country;

            // Add face recognition data if extracted
            if (faceDescriptor) userData.face_descriptor = faceDescriptor;
            if (faceReferencePhoto) userData.face_reference_photo = faceReferencePhoto;

            // Add companyId only if creator is not an admin
            if (roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN && currentUserCompanyId) {
                userData.companyId = currentUserCompanyId;
            } else {
                const roleData = await this.roleService.findOneById(role);
                userData.companyId = roleData?.companyId || null;

                userData['roleLevel'] = roleData?.level;
                if (roleData?.name === ENUM_SYSTEM_ROLE.AGENT) {
                    userData['referal_code'] =
                        this.userService.generateRandomReferalString(8);
                } else {
                    userData['referal_code'] = null;
                    userData['commission'] = 0;
                }
            }

            const created = await this.userService.create(
                userData,
                passwordHash,
                ENUM_USER_SIGN_UP_FROM.ADMIN
            );

            // Update user's roleLevel to match the assigned role's level
            await this.userService.updateUserRoleLevel(
                created._id.toString(),
                targetRoleLevel
            );

            await this.passwordHistoryService.createByAdmin(created, {
                by: createBy,
                type: ENUM_PASSWORD_HISTORY_TYPE.SIGN_UP,
            });


            await this.activityService.createByAdmin(created, {
                by: createBy,
                description: this.messageService.setMessage(
                    'activity.user.createByAdmin'
                ),
            });

            try {
                const contextData = {
                    name: created.name,
                    email: created.email,
                    password: password,
                    referral_code: created?.referal_code ?? undefined,
                };
                await this.emailService.sendWelcome(contextData, currentUserCompanyId);
            } catch (error) {}

            // await this.nodemailerService.sendEmail(
            //     created.email,
            //     "Your Account Created",
            //     `Hi ${created?.name} \nYour account has created by admin and your password expiring At ${passwordHash.passwordExpired}.\n\nThank you,\n${APP_NAME}`,
            // );

            return {
                data: created,
            };
        } catch (err: unknown) {
            // console.log("create ===== ", err);

            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @UserAdminAgentCreateDoc()
    @Response('user.create')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('agent/create')
    async createAgent(
        @AuthJwtPayload('user') createBy: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('roleLevel') currentUserLevel: number,
        @AuthJwtPayload('companyId') currentUserCompanyId: string,
        @Body()
        {
            email,
            password,
            name,
            first_name,
            last_name,
            gender,
            country_code,
            mobile,
            status,
            referal_code,
            commission,
            photo,
        }: UserAgentCreateRequestDto
    ): Promise<IResponse<any>> {
        const promises: Promise<any>[] = [
            this.roleService.findOneByName(ENUM_SYSTEM_ROLE.AGENT),
            this.userService.existByEmail(email),
        ];

        const [checkRole, emailExist] = await Promise.all(promises);

        if (!checkRole) {
            throw new NotFoundException({
                statusCode: ENUM_ROLE_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'role.error.notFound',
            });
        } else if (emailExist) {
            throw new ConflictException({
                statusCode: ENUM_USER_STATUS_CODE_ERROR.EMAIL_EXIST,
                message: 'user.error.emailExist',
            });
        }

        if (!checkRole) {
            throw new NotFoundException({
                statusCode: ENUM_ROLE_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'role.error.notFound',
            });
        }
        // Validate hierarchy - user can only assign roles at or above their level
        const targetRoleLevel = checkRole.level || 1;
        if (
            !this.userService.validateUserHierarchy(
                currentUserLevel || 1,
                targetRoleLevel
            )
        ) {
            throw new UserHierarchyInsufficientLevelException(
                currentUserLevel || 1,
                targetRoleLevel,
                'assign role to user'
            );
        }

        if (photo) {
            try {
                const uploadedPhoto = await this.uploadBase64Image(
                    photo,
                    `${Date.now()}-user`
                );
                photo = uploadedPhoto;
            } catch (error) {
                photo = undefined;
            }
        }
        const passwordHash: IAuthPassword =
            this.authService.createPassword(password);

        try {
            // Prepare user data with conditional companyId
            const userData: any = {
                email,
                role: checkRole._id.toString(),
                first_name,
                last_name,
                gender,
                country_code,
                mobile,
                status,
                name:
                    first_name && last_name
                        ? `${first_name} ${last_name}`
                        : name,
                referal_code,
                commission: commission ?? 0,
                photo,
            };

            // Add companyId only if creator is not an admin
            if (roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN && currentUserCompanyId) {
                userData.companyId = currentUserCompanyId;
            } else {
                const roleData = checkRole;
                userData.companyId = roleData?.companyId || null;

                userData['roleLevel'] = roleData?.level;
                if (roleData?.name === ENUM_SYSTEM_ROLE.AGENT) {
                    userData['referal_code'] =
                        await this.userService.generateRandomReferalString(8);
                } else {
                    userData['referal_code'] = null;
                    userData['commission'] = 0;
                }
            }

            const created = await this.userService.create(
                userData,
                passwordHash,
                ENUM_USER_SIGN_UP_FROM.ADMIN
            );

            // Update user's roleLevel to match the assigned role's level
            await this.userService.updateUserRoleLevel(
                created._id.toString(),
                targetRoleLevel
            );

            await this.passwordHistoryService.createByAdmin(created, {
                by: createBy,
                type: ENUM_PASSWORD_HISTORY_TYPE.SIGN_UP,
            });


            await this.activityService.createByAdmin(created, {
                by: createBy,
                description: this.messageService.setMessage(
                    'activity.user.createByAdmin'
                ),
            });

            try {
                const contextData = {
                    name: created.name,
                    email: created.email,
                    password: password,
                    referral_code: userData['referal_code'],
                };
                await this.emailService.sendWelcome(contextData, currentUserCompanyId);
            } catch (error) {}
            // await this.nodemailerService.sendEmail(
            //     created.email,
            //     "Your Account Created",
            //     `Hi ${created?.name} \nYour account has created by admin and your password expiring At ${passwordHash.passwordExpired}.\n\nThank you,\n${APP_NAME}`,
            // );

            return {
                data: created,
            };
        } catch (err: unknown) {
            // console.log("create ===== ", err);

            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @UserAdminUpdateDoc()
    @Response('user.update')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/update/:user')
    async update(
        @Param('user', RequestRequiredPipe, UserParsePipe, UserNotSelfPipe)
        user: UserDoc,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('roleLevel') currentUserLevel: number,
        @AuthJwtPayload('companyId') currentUserCompanyId: string,
        @Body()
        {
            name,
            first_name,
            last_name,
            role = undefined,
            gender = undefined,
            country_code,
            mobile,
            password,
            status,
            companyId,
            lname,
            fname,
            company_name,
            email,
            commission,
            photo,
            location_id,
            accessible_locations,
            employee_code,
            designation,
            department,
            employment_type,
            date_of_joining,
            date_of_birth,
            reporting_to,
            address_line1,
            address_line2,
            city,
            state,
            postcode,
            country,
            face_image,
        }: UserUpdateRequestDto
    ): Promise<IResponse<any>> {
        // Validate hierarchy - user can only update users at or below their level
        if (
            !this.userService.validateUserHierarchy(
                currentUserLevel || 1,
                user.roleLevel || 1
            )
        ) {
            throw new UserHierarchyInsufficientLevelException(
                currentUserLevel || 1,
                user.roleLevel || 1,
                'update'
            );
        }

        // Extract face descriptor if face_image is provided
        let faceDescriptor: number[] | null = null;
        let faceReferencePhoto: string | null = null;
        if (face_image) {
            try {
                const descriptor = await this.faceRecognitionService.extractDescriptor(face_image);
                faceDescriptor = Array.from(descriptor);
                faceReferencePhoto = await this.uploadBase64Image(face_image, `${Date.now()}-face-ref`);
            } catch (error) {
                if (error instanceof BadRequestException) {
                    throw error;
                }
            }
        }

        const currentUserEmail = user.email;
        const currentUserPhoto = user?.photo;
        let isPhotoUpdated = false;
        if (photo) {
            try {
                const uploadedPhoto = await this.uploadBase64Image(
                    photo,
                    user._id.toString()
                );
                photo = uploadedPhoto;
                isPhotoUpdated = true;
            } catch (error) {
                photo = currentUserPhoto;
                isPhotoUpdated = false;
            }
        }

        let checkRole = null;
        let targetRoleLevel = user.roleLevel;

        if (role) {
            checkRole = await this.roleService.findOneById(role);
            if (!checkRole) {
                throw new NotFoundException({
                    statusCode: ENUM_ROLE_STATUS_CODE_ERROR.NOT_FOUND,
                    message: 'role.error.notFound',
                });
            }

            // Validate hierarchy for role assignment
            targetRoleLevel = checkRole.level || 1;
            if (
                !this.userService.validateUserHierarchy(
                    currentUserLevel || 1,
                    targetRoleLevel
                )
            ) {
                throw new UserHierarchyInsufficientLevelException(
                    currentUserLevel || 1,
                    targetRoleLevel,
                    'assign role to user'
                );
            }
        }

        try {
            // Prepare user data with conditional companyId
            const userData: any = {
                name,
                first_name: first_name ?? fname,
                last_name: last_name ?? lname,
                role,
                email,
                gender,
                country_code,
                mobile,
                password,
                status,
                commission,
                photo,
            };

            // General fields for all roles
            if (location_id !== undefined) userData.location_id = location_id;
            if (accessible_locations !== undefined) userData.accessible_locations = Array.isArray(accessible_locations) ? accessible_locations : [];

            // Employee-specific fields: only for Employee role
            const isUpdatingEmployeeRole = checkRole
                ? checkRole.name === ENUM_SYSTEM_ROLE.EMPLOYEE
                : (user as any).role?.name === ENUM_SYSTEM_ROLE.EMPLOYEE || (user as any).roleName === ENUM_SYSTEM_ROLE.EMPLOYEE;
            if (isUpdatingEmployeeRole) {
                if (employee_code !== undefined) userData.employee_code = employee_code;
                if (designation !== undefined) userData.designation = designation;
                if (department !== undefined) userData.department = department;
                if (employment_type !== undefined) userData.employment_type = employment_type;
                if (date_of_joining !== undefined) userData.date_of_joining = date_of_joining;
                if (date_of_birth !== undefined) userData.date_of_birth = date_of_birth;
                if (reporting_to !== undefined) userData.reporting_to = reporting_to;
            }
            if (address_line1 !== undefined) userData.address_line1 = address_line1;
            if (address_line2 !== undefined) userData.address_line2 = address_line2;
            if (city !== undefined) userData.city = city;
            if (state !== undefined) userData.state = state;
            if (postcode !== undefined) userData.postcode = postcode;
            if (country !== undefined) userData.country = country;

            // Add face recognition data if extracted
            if (faceDescriptor) userData.face_descriptor = faceDescriptor;
            if (faceReferencePhoto) userData.face_reference_photo = faceReferencePhoto;

            // Add companyId only if updater is not an admin
            if (roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN && currentUserCompanyId) {
                userData.companyId = currentUserCompanyId;
            } else if (companyId !== undefined) {
                // Use provided companyId if available
                userData.companyId = companyId;
            } else if (role) {
                const roleData = await this.roleService.findOneById(role);
                userData.companyId = roleData?.companyId || null;
            }

            const updated = await this.userService.update(user, userData);

            if (isPhotoUpdated && currentUserPhoto) {
                try {
                    const currentUserPhotoPath =
                        `public` + currentUserPhoto.split('assets')[1];
                    await this.fileService.deleteFile(currentUserPhotoPath);
                } catch (error) {}
            }

            let companyID = null;
            // Update user's roleLevel if role was changed
            if (role && checkRole) {
                const updatedUser = await this.userService.updateUserRoleLevel(
                    updated._id.toString(),
                    targetRoleLevel
                );

                companyID = updatedUser?.companyId;
            }

            await this.activityService.createByUser(user, {
                description: this.messageService.setMessage(
                    'activity.user.updateByAdmin'
                ),
            });

            if (email) {
                try {
                    await this.companyService.updateCompanyEmail(
                        user?._id?.toString(),
                        email
                    );
                } catch (error) {}
            }

            return {
                data: { ...updated, password: undefined },
            };
        } catch (err: unknown) {
            console.log("update error ===== ", err);

            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @UserAdminUpdateStatusDoc()
    @Response('user.updateStatus')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Patch('/update/:user/status')
    async updateStatus(
        @Param('user', RequestRequiredPipe, UserParsePipe, UserNotSelfPipe)
        user: UserDoc,
        @Body() { status }: UserUpdateStatusRequestDto
    ): Promise<IResponse<void>> {
        if (user.status === ENUM_USER_STATUS.BLOCKED) {
            throw new BadRequestException({
                statusCode: ENUM_USER_STATUS_CODE_ERROR.STATUS_INVALID,
                message: 'user.error.statusInvalid',
                _metadata: {
                    customProperty: {
                        messageProperties: {
                            status: status.toLowerCase(),
                        },
                    },
                },
            });
        }

        try {
            await this.userService.updateStatus(user, { status });

            await this.activityService.createByUser(user, {
                description: this.messageService.setMessage(
                    `activity.user.${status.toLowerCase()}ByAdmin`
                ),
            });

            return {
                _metadata: {
                    customProperty: {
                        messageProperties: {
                            status: status.toLowerCase(),
                        },
                    },
                },
            };
        } catch (err: unknown) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @UserAdminDeleteDoc()
    @Response('user.delete')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Delete('/delete/:userId')
    async delete(
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc,
        @Param('userId', RequestRequiredPipe, UserParsePipe) userId: UserDoc
    ): Promise<void> {
        try {
            await this.userService.softDelete(userId, {
                actionBy: String(user._id),
            });

            await this.activityService.createByUser(user, {
                description: this.messageService.setMessage('activity.delete'),
            });
        } catch (err: unknown) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }

        return;
    }

    private async uploadBase64Image(
        imageBase64: string,
        fileName: string
    ): Promise<string> {
        try {
            const response = await this.fileService.uploadBase64Image(
                imageBase64,
                fileName
            );
            return response;
        } catch (error) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'user.error.base64ImageUploadFailed',
                _error: error,
            });
        }
    }
}
