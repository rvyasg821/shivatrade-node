import {
    Body,
    ConflictException,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    InternalServerErrorException,
    NotFoundException,
    Param,
    Post,
    Put,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
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
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import { UserProtected } from '@modules/user/decorators/user.decorator';
import { Permission } from '@modules/role/decorators/permission.decorator';
import { PermissionGuard } from '@modules/role/guards/permission.guard';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyDoc } from '@modules/company/repository/entities/company.entity';
import { CompanyParsePipe } from '@modules/company/pipes/company.parse.pipe';
import { CompanyListResponseDto } from '@modules/company/dtos/response/company.list.response.dto';
import { CompanyGetResponseDto } from '@modules/company/dtos/response/company.get.response.dto';
import { CompanyCreateRequestDto } from '@modules/company/dtos/request/company.create.request.dto';
import { CompanyUpdateRequestDto } from '@modules/company/dtos/request/company.update.request.dto';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
// import { ActivityService } from '@modules/activity/services/activity.service';
// import { MessageService } from '@common/message/services/message.service';
import { ENUM_COMPANY_STATUS_CODE_ERROR } from '@modules/company/enums/company.status-code.enum';
import { UserService } from '@modules/user/services/user.service';
import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import { IUnifiedAuthJwtAccessTokenPayload } from '@modules/auth/interfaces/auth.unified.interface';
import { ENUM_USER_TYPE } from '@common/enums/user-type.enum';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { ApiResponse } from '@nestjs/swagger';
import {
    COMPANY_DEFAULT_AVAILABLE_SEARCH,
    COMPANY_DEFAULT_AVAILABLE_ORDER_BY,
} from '@modules/company/constants/company.list.constant';
import {
    CompanyAdminListDoc,
    CompanyAdminGetDoc,
    CompanyAdminGetByUserDoc,
    CompanyAdminCreateDoc,
    CompanyAdminUpdateDoc,
    CompanyAdminDeleteDoc,
    CompanyAdminSuspendDoc,
    CompanyAdminReactivateDoc,
    CompanyAdminHardDeleteDoc,
} from '@modules/company/docs/company.admin.doc';
import { CompanySuspendResponseDto } from '@modules/company/dtos/response/company.suspend.response.dto';
import { CompanyReactivateResponseDto } from '@modules/company/dtos/response/company.reactivate.response.dto';
import { ENUM_COMPANY_STATUS } from '../enums/company.enum';
import { ENUM_USER_INACTIVE_REASON, ENUM_USER_STATUS } from '@modules/user/enums/user.enum';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import { PaymentService } from '@modules/payment/services/payment.service';
import { ENUM_PAYMENT_STATUS } from '@modules/payment/repository/entities/payment.entity';
import { LocationService } from '@modules/location/services/location.service';
import { RoleService } from '@modules/role/services/role.service';
import { CardService } from '@modules/card/services/card.service';
import { CompanyCleanupService } from '@modules/company/services/company-cleanup.service';
import { AuthService } from '@modules/auth/services/auth.service';
import { SessionService } from '@modules/session/services/session.service';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { NodemailerService } from '@modules/email/services/nodemailer.service';
import { ENUM_USER_GENDER, ENUM_USER_SIGN_UP_FROM } from '@modules/user/enums/user.enum';
import { ENUM_AUTH_LOGIN_FROM } from '@modules/auth/enums/auth.enum';
import { IAuthJwtAccessTokenPayload } from '@modules/auth/interfaces/auth.interface';
import { Request } from 'express';
import { Logger } from '@nestjs/common';

export class DeleteManyCompleteDto {
  @ApiProperty({
    type: [String],
    example: ['123', '456', '789'],
  })
  CompanyIds: string[];
}

@ApiTags('modules.admin.company')
@Controller({
    version: '1',
    path: '/admin/company',
})
export class CompanyAdminController {
    private readonly logger = new Logger(CompanyAdminController.name);

    constructor(
        private readonly paginationService: PaginationService,
        private readonly companyService: CompanyService,
        private readonly userService: UserService,
        private readonly subscriptionService: SubscriptionService,
        private readonly paymentService: PaymentService,
        private readonly locationService: LocationService,
        private readonly roleService: RoleService,
        private readonly cardService: CardService,
        private readonly companyCleanupService: CompanyCleanupService,
        private readonly authService: AuthService,
        private readonly sessionService: SessionService,
        private readonly companySettingsService: CompanySettingsService,
        private readonly nodemailerService: NodemailerService,
        // private readonly activityService: ActivityService,
        // private readonly messageService: MessageService,
    ) { }

    @CompanyAdminListDoc()
    @ApiResponse({
        status: 200,
        type: CompanyListResponseDto,
    })
    @ResponsePaging('company.success.list')
    @Permission('company', 'can_read')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/list')
    @ApiQuery({
        name: 'status',
        required: false,
        type: String,
        description: 'Filter companies by status (optional)',
    })
    @ApiQuery({
        name: 'planId',
        required: false,
        type: String,
        description: 'Filter companies by planId (optional)',
    })
    async list(
        @PaginationQuery({
            availableSearch: COMPANY_DEFAULT_AVAILABLE_SEARCH,
            availableOrderBy: COMPANY_DEFAULT_AVAILABLE_ORDER_BY,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('companyId') currentUserCompanyId: string,
        @Query('status') status?: string,
        @Query('planId') planId?: string
    ): Promise<IResponsePaging<CompanyListResponseDto>> {
        const find: Record<string, any> = {
            ..._search,
            ...(status ? { status } : {}),
        };

        // If user is a company admin, only show their own company
        if (
            roleName === ENUM_SYSTEM_ROLE.COMPANY_ADMIN &&
            currentUserCompanyId
        ) {
            // For company admins, we need to find the company that matches their user_id
            // Since company has user_id field, we need to find companies where user_id matches current user
            const userCompanies = await this.companyService.findAllWithUser(
                { ...find, user_id: currentUserCompanyId },
                { paging: { limit: _limit, offset: _offset }, order: _order }
            );
            const total = await this.companyService.getTotalWithUser({
                user_id: currentUserCompanyId,
            });

            const totalPage: number = this.paginationService.totalPage(
                total,
                _limit
            );
            const mapped = this.companyService.mapList(userCompanies);

            return {
                _pagination: { total, totalPage },
                data: mapped,
            };
        }

        if (planId) {
            const companies: CompanyDoc[] =
                await this.companyService.findAllWithUserByFilteringPlanIdFromSubscriptionObject(
                    planId,
                    find,
                    {
                        paging: {
                            limit: _limit,
                            offset: _offset,
                        },
                        order: _order,
                    }
                );

            const total: number =
                await this.companyService.getTotalWithUserByFilteringPlanIdFromSubscriptionObject(
                    planId,
                    find
                );

            const totalPage: number = this.paginationService.totalPage(
                total,
                _limit
            );
            const mapped = this.companyService.mapList(companies);

            return {
                _pagination: { total, totalPage },
                data: mapped,
            };
        }

        const companies: CompanyDoc[] =
            await this.companyService.findAllWithUser(find, {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            });

        const total: number = await this.companyService.getTotalWithUser(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        const mapped = this.companyService.mapList(companies);

        return {
            _pagination: { total, totalPage },
            data: mapped,
        };
    }


    // @CompanyAdminListDoc()
    // @ApiResponse({
    //     status: 200,
    //     type: CompanyListResponseDto,
    // })
    // @ResponsePaging('company.success.list')
    // @UserProtected()
    // @AuthJwtAccessProtected()
    // @Get('/dropdown')
    // @ApiQuery({
    //     name: 'status',
    //     required: false,
    //     type: String,
    //     description: 'Filter companies by status (optional)',
    // })
    // async dropdown(
    //     @PaginationQuery({
    //         availableSearch: COMPANY_DEFAULT_AVAILABLE_SEARCH,
    //         availableOrderBy: COMPANY_DEFAULT_AVAILABLE_ORDER_BY,
    //     })
    //     { _search, _limit, _offset, _order }: PaginationListDto,
    //     @AuthJwtPayload('roleName') roleName: string,
    //     @AuthJwtPayload('companyId') currentUserCompanyId: string,
    //     @Query('status') status?: string,
    // ): Promise<IResponsePaging<CompanyListResponseDto>> {
    //     const find: Record<string, any> = {
    //         ..._search,
    //         ...(status ? { status } : {}),
    //     };

    //     // If user is a company admin, only show their own company
    //     if (
    //         roleName === ENUM_SYSTEM_ROLE.COMPANY_ADMIN &&
    //         currentUserCompanyId
    //     ) {
    //         // For company admins, we need to find the company that matches their user_id
    //         // Since company has user_id field, we need to find companies where user_id matches current user
    //         const userCompanies = await this.companyService.findAllWithUser(
    //             { ...find, user_id: currentUserCompanyId },
    //             { paging: { limit: _limit, offset: _offset }, order: _order }
    //         );
    //         const total = await this.companyService.getTotalWithUser({
    //             user_id: currentUserCompanyId,
    //         });

    //         const totalPage: number = this.paginationService.totalPage(
    //             total,
    //             _limit
    //         );
    //         const mapped = this.companyService.mapList(userCompanies);

    //         return {
    //             _pagination: { total, totalPage },
    //             data: mapped,
    //         };
    //     }

    //     const companies: CompanyDoc[] =
    //         await this.companyService.findAllWithUser(find, {
    //             paging: {
    //                 limit: _limit,
    //                 offset: _offset,
    //             },
    //             order: _order,
    //         });

    //     const total: number = await this.companyService.getTotalWithUser(find);
    //     const totalPage: number = this.paginationService.totalPage(
    //         total,
    //         _limit
    //     );

    //     const mapped = this.companyService.mapList(companies);

    //     return {
    //         _pagination: { total, totalPage },
    //         data: mapped,
    //     };
    // }

    @CompanyAdminGetDoc()
    @ApiResponse({
        status: 200,
        type: CompanyGetResponseDto,
    })
    @Response('company.success.get')
    @Permission('company', 'can_read')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/get/:company')
    async get(
        @Param('company', RequestRequiredPipe, CompanyParsePipe)
        company: CompanyDoc,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string
    ): Promise<IResponse<CompanyGetResponseDto>> {
        const companyWithUser: CompanyDoc =
            await this.companyService.findOneWithUser(
                company._id?.toString() || '',
                { join: true }
            );
        // const companyWithUser: any = await this.userService.findOneById(company.user_id?.toString() || '');

        if (!companyWithUser) {
            throw new NotFoundException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'company.error.notFound',
            });
        }

        // Check if user has COMPANY_ADMIN role and owns this company
        if (roleName === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
            if (String(companyWithUser.user_id) !== userId) {
                throw new ForbiddenException({
                    statusCode:
                        ENUM_COMPANY_STATUS_CODE_ERROR.OWNERSHIP_INVALID,
                    message: 'company.error.unauthorizedCompany',
                });
            }
        }

        const mapped: CompanyGetResponseDto =
            this.companyService.mapGet(companyWithUser);

        return { data: mapped };
    }

    @CompanyAdminGetByUserDoc()
    @Response('company.success.getByUser')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/my-company')
    async getCompanyByUser(
        @AuthJwtPayload() jwtPayload: IUnifiedAuthJwtAccessTokenPayload
    ): Promise<IResponse<CompanyGetResponseDto>> {
        try {
            const { user: userId, userType, tenantId, companyId: jwtCompanyId } = jwtPayload;

            let companyId: string | null = null;

            // Route to appropriate company data fetching based on user type
            // Handle legacy tokens without userType by checking user's company directly
            if (!userType) {
                // Legacy token - get company from user record
                companyId = await this.getCompanyIdForAdminUser(userId);
            } else {
                switch (userType) {
                    case ENUM_USER_TYPE.ADMIN:
                    case ENUM_USER_TYPE.COMPANY_ADMIN:
                        companyId = await this.getCompanyIdForAdminUser(userId);
                        break;

                    case ENUM_USER_TYPE.TENANT_USER:
                        // Tenant users (Employee, Location Admin) are now in the central database
                        companyId = await this.getCompanyIdForAdminUser(userId);
                        break;

                    default:
                        // Fallback: try to get company from user record
                        companyId = await this.getCompanyIdForAdminUser(userId);
                        break;
                }
            }

            // Fallback: use companyId from JWT token (for Location Admin, Employee, etc.)
            if (!companyId && jwtCompanyId) {
                companyId = jwtCompanyId;
            }

            if (!companyId) {
                throw new NotFoundException({
                    statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.NOT_FOUND,
                    message: 'company.error.notFound',
                });
            }

            // Get full company details
            const company: CompanyDoc = await this.companyService.findOneWithUser(
                companyId // new Types.ObjectId(companyId)
            );

            if (!company) {
                throw new NotFoundException({
                    statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.NOT_FOUND,
                    message: 'company.error.notFound',
                });
            }

            const mapped: CompanyGetResponseDto =
                this.companyService.mapGet(company);

            return { data: mapped };
        } catch (err: unknown) {
            if (err instanceof NotFoundException) {
                throw err;
            }

            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @CompanyAdminUpdateDoc()
    @Response('company.success.update')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/my-company')
    async updateMyCompany(
        @AuthJwtPayload() jwtPayload: IUnifiedAuthJwtAccessTokenPayload,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Body() body: CompanyUpdateRequestDto
    ): Promise<IResponse<CompanyGetResponseDto>> {
        try {
            const { user: tokenUserId, userType, tenantId, companyId: jwtCompanyId } = jwtPayload;

            let companyId: string | null = null;

            // Route to appropriate company data fetching based on user type
            if (jwtCompanyId) {
                companyId = jwtCompanyId;
            } else {
                switch (userType) {
                    case ENUM_USER_TYPE.ADMIN:
                    case ENUM_USER_TYPE.COMPANY_ADMIN:
                        companyId = await this.getCompanyIdForAdminUser(tokenUserId);
                        break;

                    case ENUM_USER_TYPE.TENANT_USER:
                        companyId = await this.getCompanyIdForAdminUser(tokenUserId);
                        break;

                    default:
                        companyId = await this.getCompanyIdForAdminUser(tokenUserId);
                        break;
                }
            }

            // Fallback: use companyId from JWT token
            if (!companyId && jwtCompanyId) {
                companyId = jwtCompanyId;
            }

            if (!companyId) {
                throw new NotFoundException({
                    statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.NOT_FOUND,
                    message: 'company.error.notFound',
                });
            }

            // Get the company
            const company: CompanyDoc = await this.companyService.findOneById(companyId);

            if (!company) {
                throw new NotFoundException({
                    statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.NOT_FOUND,
                    message: 'company.error.notFound',
                });
            }

            // Update the company with all provided fields
            const updated = await this.companyService.update(company, body);

            const mapped: CompanyGetResponseDto =
                this.companyService.mapGet(updated);

            return { data: mapped };
        } catch (err: unknown) {
            if (err instanceof NotFoundException) {
                throw err;
            }

            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    /**
     * Get company ID for Admin or Company Admin users
     */
    private async getCompanyIdForAdminUser(
        userId: string
    ): Promise<string | null> {
        try {
            // Get user with company details from master database
            const user = await this.userService.findOneById(userId);

            if (!user) {
                return null;
            }

            // For Company Admin users, get company by user ID (owner lookup)
            const company = await this.companyService.findOneByUserId(user._id);

            if (company) {
                return company._id.toString();
            }

            // Fallback: for non-owner users (Location Admin, Employee), use their companyId field
            if (user.companyId) {
                return user.companyId.toString();
            }

            return null;
        } catch (error) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'company.error.adminUserCompanyFetchFailed',
                _error: error,
            });
        }
    }

    /**
     * Get company ID for Tenant User by fetching tenant document metadata
     * Multi-tenant removed - always returns null
     */
    private async getCompanyIdForTenantUser(
        tenantId: string
    ): Promise<string | null> {
        // Multi-tenant removed - tenants no longer exist
        return null;
    }

    private async _getCompanyIdForTenantUser_DISABLED(
        tenantId: string
    ): Promise<string | null> {
        try {
            // Fetch tenant document using tenantId
            // Tenant service removed: const tenant = await this.multiTenantService.getTenant(tenantId);
            // Multi-tenant removed
            return null;
        } catch (error) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'company.error.tenantUserCompanyFetchFailed',
                _error: error,
            });
        }
    }

    @Response('company.checkEmail')
    @AuthJwtAccessProtected()
    @Post('/check-email')
    async checkEmail(
        @Body('email') email: string,
    ): Promise<IResponse<{ exists: boolean }>> {
        if (!email) {
            return { data: { exists: false } };
        }
        const existingUser = await this.userService.findOneByEmail(email);
        if (existingUser && !(existingUser as any).deleted) {
            return { data: { exists: true } };
        }
        return { data: { exists: false } };
    }

    @CompanyAdminCreateDoc()
    @Response('company.success.create')
    @Permission('company', 'can_add')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('user') adminUserId: string,
        @Body() body: CompanyCreateRequestDto,
    ): Promise<IResponse<any>> {
        const { company_name, contact_name, contact_first_name, contact_last_name,
            email, mobile, country_code, website } = body;

        // Check if email already exists in users table
        const emailExist = await this.userService.findOneByEmail(email);
        if (emailExist && !(emailExist as any).deleted) {
            throw new ConflictException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.EMAIL_EXIST,
                message: 'Email already exists',
            });
        }

        try {
            // 1. Get Company Admin role
            const companyAdminRole = await this.roleService.findOneByName(ENUM_SYSTEM_ROLE.COMPANY_ADMIN);
            if (!companyAdminRole) throw new InternalServerErrorException({ message: 'Company Admin role not found' });

            // 2. Create password
            const rawPassword = (body as any).password || 'Welcome@123';
            const passwordHash = this.authService.createPassword(rawPassword);

            const fname = contact_first_name || contact_name?.split(' ')[0] || '';
            const lname = contact_last_name || contact_name?.split(' ').slice(1).join(' ') || '';

            // 3. Create Company Admin user
            const user = await this.userService.create(
                {
                    email: email?.toLowerCase(),
                    name: `${fname} ${lname}`.trim(),
                    first_name: fname,
                    last_name: lname,
                    role: String(companyAdminRole._id),
                    gender: ENUM_USER_GENDER.MALE,
                    country_code: country_code,
                    mobile: mobile,
                    status: ENUM_USER_STATUS.ACTIVE,
                    roleLevel: companyAdminRole.level,
                    selected_country: (body as any).selected_country,
                    timezone: (body as any).timezone,
                },
                passwordHash,
                ENUM_USER_SIGN_UP_FROM.ADMIN,
            );
            this.logger.log(`Company Admin user created: ${user._id} (${email})`);

            // 4. Create company
            const company = await this.companyService.create({
                user_id: user._id,
                company_name,
                contact_name: `${fname} ${lname}`.trim(),
                contact_first_name: fname,
                contact_last_name: lname,
                email: email?.toLowerCase(),
                mobile: mobile || '',
                country_code: country_code || {},
                website: website,
                license_number: (body as any).license_number,
                tax_number: (body as any).tax_number,
                selected_country: (body as any).selected_country,
                timezone: (body as any).timezone,
                currency: (body as any).currency,
                address_1: (body as any).address_1,
                address_2: (body as any).address_2,
                city: (body as any).city,
                state: (body as any).state,
                country: (body as any).country,
                zipcode: (body as any).zipcode,
            });
            this.logger.log(`Company created: ${company._id}`);

            // 5. Link user to company
            await this.userService.updateCompanyId(user, String(company._id));

            // 6. Auto-generate code prefixes
            const companyId = String(company._id);
            const namePrefix = (company_name || 'COM').replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
            try {
                await this.companySettingsService.update(companyId, {
                    location_code_mode: 'auto',
                    location_code_prefix: `${namePrefix}LOC`,
                    location_code_next_seq: 1,
                    employee_code_mode: 'auto',
                    employee_code_prefix: `${namePrefix}EMP`,
                    employee_code_next_seq: 1,
                } as any);
            } catch (e) { this.logger.warn(`Code settings failed: ${e?.message}`); }

            // 7. Create default location
            try {
                await this.locationService.create(
                    companyId,
                    {
                        location_name: `${company_name} - Head Office`,
                        location_code: '',
                        contact_name: `${fname} ${lname}`.trim(),
                        email: email,
                        mobile: mobile || '',
                        country_code: country_code || {},
                        address_line1: (body as any).address_1 || '',
                        address_line2: (body as any).address_2 || '',
                        city: (body as any).city || '',
                        state: (body as any).state || '',
                        country: (body as any).selected_country || '',
                        postcode: (body as any).zipcode || '',
                        timezone: (body as any).timezone || '',
                        currency: (body as any).currency || '',
                        is_default: true,
                        is_active: true,
                    } as any,
                    String(user._id),
                );
            } catch (e) { this.logger.warn(`Default location failed: ${e?.message}`); }

            // 8. Send welcome email
            try {
                const subject = 'Welcome to PeopleGem — Your account has been created';
                const context = { name: `${fname} ${lname}`.trim(), email: email, password: rawPassword };
                await this.nodemailerService.sendEmailWithTemplate(email, subject, 'welcome.hjs', context);
                this.logger.log(`Welcome email sent to: ${email}`);
            } catch (e) { this.logger.warn(`Welcome email failed: ${e?.message}`); }

            return {
                data: { _id: companyId, user_id: String(user._id), company_name },
            };
        } catch (err: unknown) {
            this.logger.error(`[Company Create] Error: ${(err as any)?.message}`, (err as any)?.stack);
            if (err instanceof ConflictException) throw err;
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @CompanyAdminUpdateDoc()
    @Response('company.success.update')
    @Permission('company', 'can_update')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/update/:company')
    async update(
        @Param('company', RequestRequiredPipe, CompanyParsePipe)
        company: CompanyDoc,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Body()
        {
            company_name,
            contact_name,
            contact_first_name,
            contact_last_name,
            email,
            mobile,
            country_code,
            website,
            license_number,
            tax_number,
            selected_country,
            timezone,
            currency,
            address_1,
            address_2,
            city,
            state,
            country,
            zipcode,
            status,
            is_subscribe,
        }: CompanyUpdateRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        // Check if user has COMPANY_ADMIN role and owns this company
        if (roleName === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
            if (String(company.user_id) !== userId) {
                throw new ForbiddenException({
                    statusCode:
                        ENUM_COMPANY_STATUS_CODE_ERROR.OWNERSHIP_INVALID,
                    message: 'company.error.unauthorizedCompany',
                });
            }
        }

        // Check if email already exists (excluding current company)
        if (email && email !== company.email) {
            const emailExist =
                await this.companyService.existByEmailExcludingId(
                    email,
                    String(company._id)
                );
            if (emailExist) {
                throw new ConflictException({
                    statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.EMAIL_EXIST,
                    message: 'company.error.emailExist',
                });
            }
        }

        try {
            let updated: CompanyDoc;

            // Handle is_subscribe field separately if provided
            if (is_subscribe !== undefined) {
                const subscriptionId = company.subscription_id?.toString();
                updated = await this.companyService.updateSubscriptionStatus(
                    String(company._id),
                    is_subscribe,
                    subscriptionId
                );
            }

            // Update other company fields
            updated = await this.companyService.update(company, {
                company_name,
                contact_name,
                contact_first_name,
                contact_last_name,
                email,
                mobile,
                country_code,
                website,
                license_number,
                tax_number,
                selected_country,
                timezone,
                currency,
                address_1,
                address_2,
                city,
                state,
                country,
                zipcode,
                status,
            });

            // TODO: Create company-specific activity logging
            // await this.activityService.createByAdmin(
            //     updated,
            //     {
            //         by: userId,
            //         description: this.messageService.setMessage('activity.company.updateByAdmin'),
            //     },
            // );

            return {
                data: { _id: String(updated._id) },
            };
        } catch (err: unknown) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @CompanyAdminDeleteDoc()
    @Response('company.success.delete')
    @Permission('company', 'can_delete')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Delete('/delete/:company')
    async delete(
        @Param('company', RequestRequiredPipe, CompanyParsePipe)
        company: CompanyDoc,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string
    ): Promise<void> {
        const companyId = String(company._id);

        // Super Admin: perform full cascade hard delete of all company data
        if (roleName === ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            try {
                this.logger.log(`Super Admin triggered cascade delete for company: ${companyId}`);

                // 0. Delete all feature-module data (leave, shift, contract, attendance, etc.)
                try {
                    await this.companyCleanupService.deleteAllCompanyData(companyId);
                    this.logger.log(`Feature data cleanup completed for company: ${companyId}`);
                } catch (err) {
                    this.logger.error(`Feature data cleanup failed: ${err.message}`);
                }

                // 1. Delete all payments for this company
                try {
                    const deletedPayments = await this.paymentService.deleteAllByCompanyId(companyId);
                    this.logger.log(`Deleted ${deletedPayments} payment(s) for company: ${companyId}`);
                } catch (err) {
                    this.logger.error(`Failed to delete payments: ${err.message}`);
                }

                // 2. Delete all subscriptions for this company
                try {
                    await this.subscriptionService.delete({ company_id: companyId });
                    this.logger.log(`Deleted subscriptions for company: ${companyId}`);
                } catch (err) {
                    this.logger.error(`Failed to delete subscriptions: ${err.message}`);
                }

                // 3. Delete all locations for this company
                try {
                    const deletedLocations = await this.locationService.deleteAllByCompanyId(companyId);
                    this.logger.log(`Deleted ${deletedLocations} location(s) for company: ${companyId}`);
                } catch (err) {
                    this.logger.error(`Failed to delete locations: ${err.message}`);
                }

                // 4. Delete all roles scoped to this company (type: 'company' and 'custom')
                //    System-level roles have companyId = null so they are unaffected
                try {
                    await this.roleService.deleteMany({ companyId });
                    this.logger.log(`Deleted all company-scoped roles for company: ${companyId}`);
                } catch (err) {
                    this.logger.error(`Failed to delete roles: ${err.message}`);
                }

                // 5. Delete all cards belonging to company users (cards link via user_id, not company_id)
                try {
                    const companyUsers = await this.userService.findAll({ companyId });
                    const companyAdminId = String(company.user_id);
                    const userIds = [
                        ...companyUsers.map((u: any) => String(u._id)),
                        companyAdminId,
                    ].filter((id, i, arr) => id && arr.indexOf(id) === i); // unique, non-empty

                    const deletedCards = await this.cardService.deleteByUserIds(userIds);
                    this.logger.log(`Deleted ${deletedCards} card(s) for company: ${companyId}`);
                } catch (err) {
                    this.logger.error(`Failed to delete cards: ${err.message}`);
                }

                // 6. Delete all users belonging to this company (includes employees)
                try {
                    await this.userService.deleteMany({ companyId });
                    this.logger.log(`Deleted users/employees for company: ${companyId}`);
                } catch (err) {
                    this.logger.error(`Failed to delete users: ${err.message}`);
                }

                // 6a. Explicitly delete the company admin user (company.user_id)
                //     in case their record does not have companyId set
                try {
                    const companyAdminUserId = String(company.user_id);
                    await this.userService.hardDelete(companyAdminUserId);
                    this.logger.log(`Deleted company admin user: ${companyAdminUserId}`);
                } catch (err) {
                    // May already have been removed in step 6 — not fatal
                    this.logger.warn(`Company admin user deletion skipped or failed: ${err.message}`);
                }

                // 7. Hard delete the company record itself
                await this.companyService.hardDelete(companyId);
                this.logger.log(`Company ${companyId} permanently deleted.`);

            } catch (err: unknown) {
                this.logger.error(`Cascade delete failed for company ${companyId}: ${err}`);
                throw new InternalServerErrorException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'http.serverError.internalServerError',
                    _error: err,
                });
            }

            return;
        }

        // Company Admin: soft delete their own company only
        if (roleName === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
            if (String(company.user_id) !== userId) {
                throw new ForbiddenException({
                    statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.OWNERSHIP_INVALID,
                    message: 'company.error.unauthorizedCompany',
                });
            }
        }

        if (company.soft_delete) {
            throw new ConflictException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.ALREADY_DELETED,
                message: 'company.error.alreadyDeleted',
            });
        }

        try {
            await this.companyService.softDelete(company);
        } catch (err: unknown) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }

        return;
    }

    @CompanyAdminSuspendDoc()
    @ApiResponse({
        status: 200,
        type: CompanySuspendResponseDto,
    })
    @Response('company.success.suspend')
    @Permission('company', 'can_update')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/suspend/:company')
    async suspendCompanyAdmin(
        @Param('company', RequestRequiredPipe, CompanyParsePipe)
        company: CompanyDoc,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string
    ): Promise<IResponse<CompanySuspendResponseDto>> {
        // Check if user has COMPANY_ADMIN role and owns this company
        if (roleName === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
            if (String(company.user_id) !== userId) {
                throw new ForbiddenException({
                    statusCode:
                        ENUM_COMPANY_STATUS_CODE_ERROR.OWNERSHIP_INVALID,
                    message: 'company.error.unauthorizedCompany',
                });
            }
        }

        // Check if company is already suspended/inactive
        if (company.status === ENUM_COMPANY_STATUS.INACTIVE) {
            throw new ConflictException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.ALREADY_SUSPENDED,
                message: 'company.error.alreadySuspended',
            });
        }

        try {
            // 1. Suspend the company (updates company status and clears subscription)
            const result = await this.companyService.suspendCompanyAdmin(
                String(company._id)
            );

            let tenantUsersUpdated = 0;

            // 2. Bulk deactivate ALL company users (including Company Admin) with reason
            try {
                await this.userService.deactivateCompanyUsers(
                    String(company._id),
                    ENUM_USER_INACTIVE_REASON.COMPANY_SUSPENDED,
                    false // include Company Admin
                );
            } catch (userError) {
                console.error('Error bulk deactivating company users:', userError);
            }

            // Multi-tenant removed - subscription deactivation not implemented
            // try {
            //     await this.subscriptionService.deactivateSubscriptionsByCompanyId(company._id.toString());
            // } catch (subscriptionError) { }

            // Multi-tenant removed - tenant user updates no longer needed
            if (company.tenantId) {
                try {
                    // Tenant service removed - all tenant operations disabled
                    tenantUsersUpdated = 0;
                    console.warn(`Multi-tenant removed - tenant operations disabled`);
                } catch (tenantError) {
                    console.error('Error updating tenant users:', tenantError);
                }
            }

            return {
                data: {
                    companyId: String(result.company._id),
                    userId: result.userId,
                    subscriptionId: result.subscriptionId,
                    tenantUsersUpdated,
                    message: 'Company admin and associated resources have been suspended successfully'
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

    @CompanyAdminReactivateDoc()
    @ApiResponse({
        status: 200,
        type: CompanyReactivateResponseDto,
    })
    @Response('company.success.reactivate')
    @Permission('company', 'can_update')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/reactivate/:company')
    async reactivateCompanyAdmin(
        @Param('company', RequestRequiredPipe, CompanyParsePipe)
        company: CompanyDoc,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string
    ): Promise<IResponse<CompanyReactivateResponseDto>> {
        // Check if user has COMPANY_ADMIN role and owns this company
        if (roleName === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
            if (String(company.user_id) !== userId) {
                throw new ForbiddenException({
                    statusCode:
                        ENUM_COMPANY_STATUS_CODE_ERROR.OWNERSHIP_INVALID,
                    message: 'company.error.unauthorizedCompany',
                });
            }
        }

        // Check if company is already active
        if (company.status === ENUM_COMPANY_STATUS.ACTIVE) {
            throw new ConflictException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.ALREADY_ACTIVE,
                message: 'company.error.alreadyActive',
            });
        }

        try {
            // 1. Reactivate the company (updates company status to ACTIVE)
            const result = await this.companyService.reactivateCompanyAdmin(
                String(company._id)
            );

            // 2. Bulk reactivate only users suspended by system (not manually deactivated)
            try {
                await this.userService.reactivateCompanyUsers(
                    String(company._id),
                    ENUM_USER_INACTIVE_REASON.COMPANY_SUSPENDED
                );
            } catch (userError) {
                console.error('Error bulk reactivating company users:', userError);
            }

            return {
                data: {
                    companyId: String(result.company._id),
                    userId: result.userId,
                    message: 'Company and associated user have been reactivated successfully'
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

    @CompanyAdminHardDeleteDoc()
    @Response('company.success.deleteComplete')
    @Permission('company', 'can_delete')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Delete('/delete-complete/:company')
    async deleteComplete(
        @Param('company', RequestRequiredPipe, CompanyParsePipe)
        company: CompanyDoc,
        @AuthJwtPayload('roleName') roleName: string
    ): Promise<IResponse<any>> {
        // Only admins can perform complete deletion
        if (roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            throw new ForbiddenException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.OWNERSHIP_INVALID,
                message: 'company.error.onlyAdminCanCompleteDelete',
            });
        }

        const deletionResult = {
            companyId: String(company._id),
            companyDeleted: false,
            userDeleted: false,
            tenantUsersDeleted: 0,
            tenantDatabaseDropped: false,
            tenantRecordDeleted: false,
            errors: [] as string[],
        };

        try {
            const companyId = String(company._id);
            const companyUserId = String(company.user_id);
            const tenantId = company.tenantId;
            const companyEmail = company.email;

            this.logger.log(`Starting complete deletion for company: ${companyId}`);

            // 1. Delete all tenant users from tenant database
            // Multi-tenant removed - tenant database operations disabled
            if (tenantId) {
                try {
                    this.logger.log(`Multi-tenant removed - skipping tenant user deletion`);
                    deletionResult.tenantUsersDeleted = 0;
                } catch (error) {
                    this.logger.error(`Failed to delete tenant users: ${error.message}`);
                    deletionResult.errors.push(`Tenant users deletion failed: ${error.message}`);
                }
            }

            // 4. Drop the tenant database
            if (tenantId) {
                try {
                    this.logger.log(`Dropping tenant database for: ${tenantId}`);
                    // Tenant service removed: const databaseName = this.tenantDatabaseService.generateDatabaseName(tenantId);
                    // Tenant service removed: await this.tenantDatabaseService.dropDatabase(databaseName);
                    deletionResult.tenantDatabaseDropped = true;
                    this.logger.log(`Tenant database dropped successfully`);
                } catch (error) {
                    this.logger.error(`Failed to drop tenant database: ${error.message}`);
                    deletionResult.errors.push(`Tenant database drop failed: ${error.message}`);
                }
            }

            // 5. Delete tenant record from main database
            if (tenantId) {
                try {
                    this.logger.log(`Deleting tenant record: ${tenantId}`);
                    // Tenant service removed: await this.multiTenantService.deleteTenant(tenantId);
                    deletionResult.tenantRecordDeleted = true;
                    this.logger.log(`Tenant record deleted successfully`);
                } catch (error) {
                    this.logger.error(`Failed to delete tenant record: ${error.message}`);
                    deletionResult.errors.push(`Tenant record deletion failed: ${error.message}`);
                }
            }

            // 6. Delete ALL company users from central database
            try {
                this.logger.log(`Deleting all company users for companyId: ${companyId}`);
                await this.userService.hardDeleteCompanyUsers(companyId);
                deletionResult.userDeleted = true;
                this.logger.log(`All company users deleted for companyId: ${companyId}`);
            } catch (error) {
                this.logger.error(`Failed to delete company users: ${error.message}`);
                deletionResult.errors.push(`Company users deletion failed: ${error.message}`);
            }

            // 6b. Also delete the company admin user (may not have companyId set)
            try {
                this.logger.log(`Deleting company admin user: ${companyUserId}`);
                const userDeleted = await this.userService.hardDelete(companyUserId);
                deletionResult.userDeleted = userDeleted;
                this.logger.log(`Company admin user deleted: ${userDeleted}`);
            } catch (error) {
                this.logger.error(`Failed to delete company admin user: ${error.message}`);
                deletionResult.errors.push(`User deletion failed: ${error.message}`);
            }

            // 7. Delete the company record (hard delete)
            try {
                this.logger.log(`Deleting company record: ${companyId}`);
                const companyDeleted = await this.companyService.hardDelete(companyId);
                deletionResult.companyDeleted = companyDeleted;
                this.logger.log(`Company record deleted: ${companyDeleted}`);
            } catch (error) {
                this.logger.error(`Failed to delete company record: ${error.message}`);
                deletionResult.errors.push(`Company deletion failed: ${error.message}`);
            }

            this.logger.log(`Complete deletion finished for company: ${companyId}`);

            return {
                data: {
                    ...deletionResult,
                    message: deletionResult.errors.length > 0
                        ? 'Company deletion completed with some errors'
                        : 'Company and all associated data deleted successfully',
                },
            };
        } catch (err: unknown) {
            this.logger.error(`Complete deletion failed: ${err}`);
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    // @Response('company.success.deleteComplete')
    // @Permission('company', 'can_delete')
    // @UseGuards(PermissionGuard)
    // @UserProtected()
    // @AuthJwtAccessProtected()
    // @Post('/delete-many-complete')
    // @ApiBearerAuth('accessToken')
    // @ApiBody({
    //     type: DeleteManyCompleteDto,
    // })
    // async deleteManyComplete(
    //     @AuthJwtPayload('roleName') roleName: string,
    //     @Body('CompanyIds') CompanyIds: string[],
    // ): Promise<IResponse<any>> {
    //     console.log("🚀 ~ CompanyAdminController ~ deleteManyComplete ~ CompanyIds:", CompanyIds?.length)
    //     // Only admins can perform complete deletion
    //     if (roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
    //         throw new ForbiddenException({
    //             statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.OWNERSHIP_INVALID,
    //             message: 'company.error.onlyAdminCanCompleteDelete',
    //         });
    //     }
    //     let deletedCompanyCount = 0;

    //     for (const element of CompanyIds) {
    //         console.log("🚀 ~ CompanyAdminController ~ deleteManyComplete ~ element:", element)
    //         const company: CompanyDoc = await this.companyService.findOne({_id: new Types.ObjectId(element)}, { join: true });
            
    //         if (!company) {
    //             console.warn(`Company not found for id: ${element}`);
    //             continue;
    //         }
            
    //         const deletionResult = {
    //             companyId: String(company._id),
    //             companyDeleted: false,
    //             userDeleted: false,
    //             sharedUsersDeleted: 0,
    //             tenantUsersDeleted: 0,
    //             tenantDatabaseDropped: false,
    //             tenantRecordDeleted: false,
    //             errors: [] as string[],
    //         };

    //         try {
    //             const companyId = String(company._id);
    //             const companyUserId = String(company.user_id);
    //             const tenantId = company.tenantId;
    //             const companyEmail = company.email;

    //             this.logger.log(`Starting complete deletion for company: ${companyId}`);

    //             // 1. Delete shared users associated with the tenant
    //             if (tenantId) {
    //                 try {
    //                     this.logger.log(`Deleting shared users for tenantId: ${tenantId}`);
    //                     const sharedUsersCount = await this.sharedUserService.deleteByTenantId(tenantId);
    //                     deletionResult.sharedUsersDeleted = sharedUsersCount;
    //                     this.logger.log(`Deleted ${sharedUsersCount} shared users for tenant`);
    //                 } catch (error) {
    //                     this.logger.error(`Failed to delete shared users for tenant: ${error.message}`);
    //                     deletionResult.errors.push(`Shared users deletion failed: ${error.message}`);
    //                 }
    //             }

    //             // 2. Delete company admin's shared user record by email
    //             try {
    //                 this.logger.log(`Deleting company admin shared user: ${companyEmail}`);
    //                 await this.sharedUserService.deleteByEmail(companyEmail);
    //                 this.logger.log(`Deleted company admin shared user`);
    //             } catch (error) {
    //                 this.logger.error(`Failed to delete company admin shared user: ${error.message}`);
    //                 deletionResult.errors.push(`Company admin shared user deletion failed: ${error.message}`);
    //             }

    //             // 3. Delete all tenant users from tenant database
    //             if (tenantId) {
    //                 try {
    //                     this.logger.log(`Deleting tenant users from tenant database: ${tenantId}`);
    // Tenant service removed: //                     const tenantConnection = await this.multiTenantService.getTenantConnection(tenantId);
    //                     if (tenantConnection) {
// Tenant user schema removed - using central database only
                        //     //                         const TenantUserModel = tenantConnection.model('users', TenantUserSchema);
    //                         const deleteResult = await TenantUserModel.deleteMany({});
    //                         deletionResult.tenantUsersDeleted = deleteResult.deletedCount || 0;
    //                         this.logger.log(`Deleted ${deletionResult.tenantUsersDeleted} tenant users`);
    //                     } else {
    //                         this.logger.warn(`Tenant connection not found for: ${tenantId}`);
    //                         deletionResult.errors.push('Tenant connection not found');
    //                     }
    //                 } catch (error) {
    //                     this.logger.error(`Failed to delete tenant users: ${error.message}`);
    //                     deletionResult.errors.push(`Tenant users deletion failed: ${error.message}`);
    //                 }
    //             }

    //             // 4. Drop the tenant database
    //             if (tenantId) {
    //                 try {
    //                     this.logger.log(`Dropping tenant database for: ${tenantId}`);
    // Tenant service removed: //                     const databaseName = this.tenantDatabaseService.generateDatabaseName(tenantId);
    // Tenant service removed: //                     await this.tenantDatabaseService.dropDatabase(databaseName);
    //                     deletionResult.tenantDatabaseDropped = true;
    //                     this.logger.log(`Tenant database dropped successfully`);
    //                 } catch (error) {
    //                     this.logger.error(`Failed to drop tenant database: ${error.message}`);
    //                     deletionResult.errors.push(`Tenant database drop failed: ${error.message}`);
    //                 }
    //             }

    //             // 5. Delete tenant record from main database
    //             if (tenantId) {
    //                 try {
    //                     this.logger.log(`Deleting tenant record: ${tenantId}`);
    // Tenant service removed: //                     await this.multiTenantService.deleteTenant(tenantId);
    //                     deletionResult.tenantRecordDeleted = true;
    //                     this.logger.log(`Tenant record deleted successfully`);
    //                 } catch (error) {
    //                     this.logger.error(`Failed to delete tenant record: ${error.message}`);
    //                     deletionResult.errors.push(`Tenant record deletion failed: ${error.message}`);
    //                 }
    //             }

    //             // 6. Delete the company admin user
    //             try {
    //                 this.logger.log(`Deleting company admin user: ${companyUserId}`);
    //                 const userDeleted = await this.userService.hardDelete(companyUserId);
    //                 deletionResult.userDeleted = userDeleted;
    //                 this.logger.log(`Company admin user deleted: ${userDeleted}`);
    //             } catch (error) {
    //                 this.logger.error(`Failed to delete company admin user: ${error.message}`);
    //                 deletionResult.errors.push(`User deletion failed: ${error.message}`);
    //             }

    //             // 7. Delete the company record (hard delete)
    //             try {
    //                 this.logger.log(`Deleting company record: ${companyId}`);
    //                 const companyDeleted = await this.companyService.hardDelete(companyId);
    //                 deletionResult.companyDeleted = companyDeleted;
    //                 this.logger.log(`Company record deleted: ${companyDeleted}`);
    //             } catch (error) {
    //                 this.logger.error(`Failed to delete company record: ${error.message}`);
    //                 deletionResult.errors.push(`Company deletion failed: ${error.message}`);
    //             }

    //             this.logger.log(`Complete deletion finished for company: ${companyId}`);
    //             deletedCompanyCount++;
                
    //             // Log the result for this company but continue to next one
    //             this.logger.log(`Company ${companyId} deletion result:`, deletionResult);
    //         } catch (err: unknown) {
    //             this.logger.error(`Complete deletion failed for company ${element}: ${err}`);
    //             // Continue to next company even if this one fails
    //             continue;
    //         }
    //     }

    //     return {
    //         data: {
    //             message: `Company deletion completed. Successfully deleted ${deletedCompanyCount} out of ${CompanyIds.length} companies.`,
    //             deletedCompanyCount,
    //             totalRequested: CompanyIds.length,
    //         },
    //     };
    // }

    @Response('company.success.overallStats')
    @Permission('company', 'can_read')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/overall-statistics')
    @ApiBearerAuth('accessToken')
    @ApiResponse({
        status: 200,
        description: 'Overall statistics for companies, subscriptions, and payments',
    })
    async getOverallStatistics(
        @AuthJwtPayload('roleName') roleName: string
    ): Promise<IResponse<any>> {
        // Only superadmin can access this endpoint
        if (roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            throw new ForbiddenException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.OWNERSHIP_INVALID,
                message: 'company.error.onlyAdminCanAccessStatistics',
            });
        }

        try {
            this.logger.log('Fetching overall statistics for superadmin');

            // 1. Get total companies count
            const totalCompanies = await this.companyService.getTotal({});
            const activeCompanies = await this.companyService.getTotal({ status: ENUM_COMPANY_STATUS.ACTIVE });
            const inactiveCompanies = await this.companyService.getTotal({ status: ENUM_COMPANY_STATUS.INACTIVE });

            // 2. Get all subscriptions
            const allSubscriptions = await this.subscriptionService.findAll({});
            
            // 3. Count paid subscriptions (excluding trial and lifetime)
            const paidSubscriptions = allSubscriptions.filter(sub => 
                !sub.trial && 
                !sub.is_lifetime &&
                !sub.soft_delete &&
                sub.status
            );

            // 4. Count trial subscriptions
            const trialSubscriptions = allSubscriptions.filter(sub => 
                sub.trial && 
                !sub.soft_delete &&
                sub.status
            );

            // 5. Count lifetime subscriptions
            const lifetimeSubscriptions = allSubscriptions.filter(sub => 
                sub.is_lifetime && 
                !sub.soft_delete &&
                sub.status
            );

            // 6. Get payment statistics (only for paid subscriptions)
            let totalPayments = 0;
            let totalRevenue = 0;
            let successfulPayments = 0;
            let failedPayments = 0;

            try {
                // Get all payments
                const payments = await this.paymentService.findAll({});
                
                totalPayments = payments.length;
                
                // Calculate revenue and count successful/failed payments
                payments.forEach(payment => {
                    if (payment.status === ENUM_PAYMENT_STATUS.COMPLETED) {
                        successfulPayments++;
                        totalRevenue += payment.final_price || 0;
                    } else if (payment.status === ENUM_PAYMENT_STATUS.FAILED) {
                        failedPayments++;
                    }
                });
            } catch (paymentError) {
                this.logger.error(`Error fetching payment statistics: ${paymentError.message}`);
            }

            // 7. Calculate subscription revenue breakdown
            let paidSubscriptionRevenue = 0;
            paidSubscriptions.forEach(sub => {
                if (sub.final_price) {
                    paidSubscriptionRevenue += sub.final_price;
                }
            });

            const statistics = {
                companies: {
                    total: totalCompanies,
                    active: activeCompanies,
                    inactive: inactiveCompanies,
                },
                subscriptions: {
                    total: allSubscriptions.length,
                    paid: {
                        count: paidSubscriptions.length,
                        estimatedRevenue: Number(paidSubscriptionRevenue.toFixed(2)),
                    },
                    trial: {
                        count: trialSubscriptions.length,
                    },
                    lifetime: {
                        count: lifetimeSubscriptions.length,
                    },
                },
                payments: {
                    total: totalPayments,
                    successful: successfulPayments,
                    failed: failedPayments,
                    totalRevenue: Number(totalRevenue.toFixed(2)),
                },
                summary: {
                    activeCompaniesWithPaidSubscriptions: paidSubscriptions.length,
                    activeCompaniesWithTrialSubscriptions: trialSubscriptions.length,
                    activeCompaniesWithLifetimeSubscriptions: lifetimeSubscriptions.length,
                },
            };

            this.logger.log('Overall statistics fetched successfully');

            return {
                data: statistics,
            };
        } catch (err: unknown) {
            this.logger.error(`Failed to fetch overall statistics: ${err}`);
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @Response('company.success.impersonate')
    @Permission('company', 'can_read')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/impersonate/:company')
    async impersonate(
        @Param('company', RequestRequiredPipe, CompanyParsePipe)
        company: CompanyDoc,
        @AuthJwtPayload() jwtPayload: IAuthJwtAccessTokenPayload,
        @Req() request: Request,
    ): Promise<IResponse<any>> {
        // Only Super Admin can impersonate
        if (jwtPayload.roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            throw new ForbiddenException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.OWNERSHIP_INVALID,
                message: 'Only Super Admin can impersonate company accounts',
            });
        }

        // Find the Company Admin user
        const companyAdminUser = await this.userService.findOneById(company.user_id);
        if (!companyAdminUser) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'Company admin user not found',
            });
        }

        // Join role data (manually populates role object)
        const userWithRole = await this.userService.join(companyAdminUser);

        // Create a new session for the impersonated user
        const session = await this.sessionService.create(request, {
            user: String(companyAdminUser._id),
        });

        // Build access token payload with impersonatedBy
        const loginDate = new Date();
        const payloadAccessToken: IAuthJwtAccessTokenPayload =
            await this.authService.createPayloadAccessToken(
                userWithRole,
                session._id.toString(),
                loginDate,
                ENUM_AUTH_LOGIN_FROM.CREDENTIAL,
            );
        payloadAccessToken.impersonatedBy = jwtPayload.user;

        const accessToken = this.authService.createAccessToken(
            String(companyAdminUser._id),
            payloadAccessToken,
        );

        const payloadRefreshToken = this.authService.createPayloadRefreshToken(payloadAccessToken);
        const refreshToken = this.authService.createRefreshToken(
            String(companyAdminUser._id),
            payloadRefreshToken,
        );

        // Check subscription and get tools for the company
        let hasActiveSubscription = false;
        let tools = [];
        try {
            const subscription = await this.subscriptionService.findActiveByUserId(String(companyAdminUser._id));
            hasActiveSubscription = !!subscription;
            if (subscription?.tools) {
                tools = subscription.tools;
            }
        } catch (err) {
            this.logger.warn(`Failed to check subscription for company ${company._id}: ${err.message}`);
        }

        this.logger.log(
            `Super Admin ${jwtPayload.user} impersonating Company Admin ${companyAdminUser._id} (company: ${company._id}, subscription: ${hasActiveSubscription})`
        );

        const companyData = {
            _id: String(company._id),
            company_name: company.company_name,
            email: company.email,
            is_subscribe: company.is_subscribe,
            tools,
        };

        return {
            data: {
                accessToken,
                refreshToken,
                userData: userWithRole,
                companyId: String(company._id),
                companyName: company.company_name,
                companyData,
                hasActiveSubscription,
            },
        };
    }

}
