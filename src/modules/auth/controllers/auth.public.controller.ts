import {
    BadRequestException,
    Body,
    Controller,
    ForbiddenException,
    HttpCode,
    HttpStatus,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    Post,
    Req,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { AuthService } from '@modules/auth/services/auth.service';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';
import { ENUM_ROLE_STATUS_CODE_ERROR } from '@modules/role/enums/role.status-code.enum';
import { AuthLoginResponseDto } from '@modules/auth/dtos/response/auth.login.response.dto';
import {
    AuthPublicLoginCredentialDoc,
    AuthPublicRegisterDoc,
} from '@modules/auth/docs/auth.public.doc';
import { AuthLoginRequestDto } from '@modules/auth/dtos/request/auth.login.request.dto';
import { UserService } from '@modules/user/services/user.service';

import { ENUM_USER_STATUS_CODE_ERROR } from '@modules/user/enums/user.status-code.enum';
import {
    ENUM_USER_STATUS,
    ENUM_USER_SIGN_UP_FROM,
    ENUM_USER_GENDER,
    ENUM_USER_INACTIVE_REASON,
} from '@modules/user/enums/user.enum';
import { IUserDoc } from '@modules/user/interfaces/user.interface';

import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import { SessionService } from '@modules/session/services/session.service';
import { IRequestApp } from '@common/request/interfaces/request.interface';

import { CompanyService } from '@modules/company/services/company.service';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { AuthRegisterRequestDto } from '../dtos/request/auth.register.request.dto';
import { IAuthCompanyData } from '../interfaces/auth.company.interface';
import { ENUM_USER_TYPE } from '@common/enums/user-type.enum';
import { ITenantUserDoc } from '@modules/auth/interfaces/auth.unified.interface';
import { OTPService } from '@modules/auth/services/otp.service';
import { OTPGenerateRequestDto } from '@modules/auth/dtos/request/otp-generate.request.dto';
import { OTPVerifyRequestDto } from '@modules/auth/dtos/request/otp-verify.request.dto';
import { OTPGenerateResponseDto } from '@modules/auth/dtos/response/otp-generate.response.dto';
import { OTPVerifyResponseDto } from '@modules/auth/dtos/response/otp-verify.response.dto';
import { AuthOTPGenerateDoc, AuthOTPVerifyDoc } from '@modules/auth/docs/auth.otp.doc';
import { NodemailerService } from '@modules/email/services/nodemailer.service';
import { AzureEmailService } from '@modules/email/services/azure-email.service';
import { EnhancedEmailService } from '@modules/email/services/enhanced-email.service';

import { ToolsService } from '@modules/tools/services/tools.service';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';

import { DatabaseService } from '@common/database/services/database.service';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { LocationService } from '@modules/location/services/location.service';

@ApiTags('modules.public.auth')
@Controller({
    version: '1',
    path: '/auth',
})
export class AuthPublicController {
    private readonly logger = new Logger(AuthPublicController.name);

    constructor(
        private readonly userService: UserService,
        private readonly authService: AuthService,
        private readonly sessionService: SessionService,
        private readonly companyService: CompanyService,
        private readonly roleService: RoleService,
        private readonly otpService: OTPService,
        private readonly nodemailerService: NodemailerService,
        private readonly azureEmailService: AzureEmailService,
        private readonly enhancedEmailService: EnhancedEmailService,
        private readonly subscriptionService: SubscriptionService,
        private readonly toolsService: ToolsService,
        private readonly databaseService: DatabaseService,
        private readonly companySettingsService: CompanySettingsService,
        private readonly locationService: LocationService,
    ) { }

    @AuthPublicLoginCredentialDoc()
    @Response('auth.loginWithCredential')
    @HttpCode(HttpStatus.OK)
    @Post('/login')
    async login(
        @Body() { email, password }: AuthLoginRequestDto,
        @Req() request: IRequestApp
    ): Promise<IResponse<AuthLoginResponseDto>> {
        try {
            // Step 1: Authenticate user
            const authUser = await this.authService.authenticateUser(
                email,
                password
            );

            let userData: IUserDoc | ITenantUserDoc;
            let userId: string;
            let session: any;
            let token: AuthLoginResponseDto;

            // Step 2: Route authentication based on user type
            switch (authUser.userType) {
                case ENUM_USER_TYPE.ADMIN:
                    // Super Admin authentication
                    userData =
                        await this.authService.authenticateSuperAdmin(
                            authUser
                        );
                    userId = String(userData._id);

                    // Check user status and role
                    if (
                        (userData as IUserDoc).status !==
                        ENUM_USER_STATUS.ACTIVE
                    ) {
                        let inactiveMessage = 'user.error.inactive';
                        const inactiveReason = (userData as IUserDoc).inactive_reason;
                        if (inactiveReason === ENUM_USER_INACTIVE_REASON.SUBSCRIPTION_EXPIRED) {
                            inactiveMessage = 'user.error.subscriptionExpired';
                        } else if (inactiveReason === ENUM_USER_INACTIVE_REASON.COMPANY_SUSPENDED) {
                            inactiveMessage = 'user.error.companySuspended';
                        }
                        throw new ForbiddenException({
                            statusCode:
                                ENUM_USER_STATUS_CODE_ERROR.INACTIVE_FORBIDDEN,
                            message: inactiveMessage,
                        });
                    }

                    if (!userData.role || !userData.role.isActive) {
                        throw new ForbiddenException({
                            statusCode:
                                ENUM_ROLE_STATUS_CODE_ERROR.INACTIVE_FORBIDDEN,
                            message: 'role.error.inactive',
                        });
                    }

                    // Check password expiration
                    const checkPasswordExpiredAdmin =
                        this.authService.checkPasswordExpired(
                            (userData as IUserDoc).passwordExpired
                        );
                    if (checkPasswordExpiredAdmin) {
                        throw new ForbiddenException({
                            statusCode:
                                ENUM_USER_STATUS_CODE_ERROR.PASSWORD_EXPIRED,
                            message: 'auth.error.passwordExpired',
                        });
                    }

                    // Create session and token
                    session = await this.sessionService.create(request, {
                        user: userId,
                    });
                    await this.sessionService.setLoginSession(
                        userData as IUserDoc,
                        session
                    );
                    token = await this.authService.createUnifiedToken(
                        userData,
                        authUser.tenantId,
                        authUser.userType,
                        String(session._id)
                    );

                    // Determine isSystemUser based on actual role name
                    const adminRoleName = (userData as IUserDoc).role?.name;
                    const isReallySystemUser = adminRoleName === ENUM_SYSTEM_ROLE.SUPER_ADMIN || adminRoleName === 'Admin';

                    return {
                        data: {
                            ...token,
                            userData: {
                                _id: userId,
                                name: userData.name,
                                email: userData.email,
                                country_code: (userData as IUserDoc)
                                    .country_code,
                                mobile: (userData as IUserDoc).mobile,
                                role: userData.role,
                                gender: (userData as IUserDoc).gender,
                                status: (userData as IUserDoc).status,
                                createdAt: userData.createdAt,
                                tenantId: null,
                                userType: ENUM_USER_TYPE.ADMIN,
                                isSystemUser: isReallySystemUser,
                            },
                        },
                    };

                case ENUM_USER_TYPE.COMPANY_ADMIN:
                    // Company Admin authentication
                    userData =
                        await this.authService.authenticateCompanyAdmin(
                            authUser
                        );
                    userId = String(userData._id);

                    // Check user status and role
                    if (
                        (userData as IUserDoc).status !==
                        ENUM_USER_STATUS.ACTIVE
                    ) {
                        let companyInactiveMsg = 'user.error.inactive';
                        const companyInactiveReason = (userData as IUserDoc).inactive_reason;
                        if (companyInactiveReason === ENUM_USER_INACTIVE_REASON.SUBSCRIPTION_EXPIRED) {
                            companyInactiveMsg = 'user.error.subscriptionExpired';
                        } else if (companyInactiveReason === ENUM_USER_INACTIVE_REASON.COMPANY_SUSPENDED) {
                            companyInactiveMsg = 'user.error.companySuspended';
                        }
                        throw new ForbiddenException({
                            statusCode:
                                ENUM_USER_STATUS_CODE_ERROR.INACTIVE_FORBIDDEN,
                            message: companyInactiveMsg,
                        });
                    }

                    if (!userData.role || !userData.role.isActive) {
                        throw new ForbiddenException({
                            statusCode:
                                ENUM_ROLE_STATUS_CODE_ERROR.INACTIVE_FORBIDDEN,
                            message: 'role.error.inactive',
                        });
                    }

                    // Check password expiration
                    const checkPasswordExpiredCompany =
                        this.authService.checkPasswordExpired(
                            (userData as IUserDoc).passwordExpired
                        );
                    if (checkPasswordExpiredCompany) {
                        throw new ForbiddenException({
                            statusCode:
                                ENUM_USER_STATUS_CODE_ERROR.PASSWORD_EXPIRED,
                            message: 'auth.error.passwordExpired',
                        });
                    }

                    // Create session and token
                    session = await this.sessionService.create(request, {
                        user: userId,
                    });
                    await this.sessionService.setLoginSession(
                        userData as IUserDoc,
                        session
                    );
                    token = await this.authService.createUnifiedToken(
                        userData,
                        authUser.tenantId,
                        authUser.userType,
                        String(session._id)
                    );

                    // Fetch company data
                    let companyData: IAuthCompanyData | null = null;
                    let hasActiveSubscription = false;
                    let subscriptionInactive = false;
                    try {
                        const company =
                            await this.companyService.findOneByUserId(
                                (userData as IUserDoc)._id
                            );
                        if (company) {
                            const userId = (userData as IUserDoc)._id.toString();
                            console.log(`🔐 Login - Checking subscription for user: ${userId}`);
                            console.log(`   Company user_id: ${company?.user_id?.toString()}`);

                            // Use findAnyByUserId so we can detect "exists but inactive"
                            const anySubscription =
                                await this.subscriptionService.findAnyByUserId(userId);
                            hasActiveSubscription =
                                this.subscriptionService.isSubscriptionActive(anySubscription);
                            subscriptionInactive = !hasActiveSubscription;
                            console.log(`   hasActiveSubscription: ${hasActiveSubscription}`);

                            // Only expose tools if subscription is currently active
                            const subscription = hasActiveSubscription ? anySubscription : null;
                            const tools = subscription
                                ? subscription.tools
                                : [];
                            const helpdeskTool =
                                await this.toolsService.findOne({
                                    slug: 'helpdesk-support-ticket',
                                });
                            if (helpdeskTool) {
                                const isToolExists = tools.find(
                                    tool =>
                                        tool?._id.toString() ===
                                        helpdeskTool._id.toString()
                                );
                                if (!isToolExists) {
                                    delete userData.role.permissions
                                        .helpdesk_ticket;
                                }
                            }
                            companyData = {
                                _id: String(company._id),
                                company_name: company.company_name,
                                contact_name: company.contact_name,
                                contact_first_name: company.contact_first_name,
                                contact_last_name: company.contact_last_name,
                                email: company.email,
                                mobile: company.mobile,
                                country_code: company.country_code,
                                website: company.website,
                                tenantId: company.tenantId,
                                createdAt: company.createdAt,
                                updatedAt: company.updatedAt,
                                is_subscribe: company.is_subscribe,
                                subscription_id: company.subscription_id,
                                tools: tools,
                            };
                        }
                    } catch (error) {
                        console.warn(
                            'Failed to fetch company data for Company Admin:',
                            error
                        );
                    }

                    const responseData: any = {
                        ...token,
                        userData: {
                            _id: userId,
                            name: userData.name,
                            email: userData.email,
                            country_code: (userData as IUserDoc).country_code,
                            mobile: (userData as IUserDoc).mobile,
                            role: userData.role,
                            gender: (userData as IUserDoc).gender,
                            status: (userData as IUserDoc).status,
                            createdAt: userData.createdAt,
                            tenantId: authUser.tenantId,
                            userType: ENUM_USER_TYPE.COMPANY_ADMIN,
                            company: companyData,
                            isSystemUser: false,
                            hasActiveSubscription: hasActiveSubscription,
                            // Frontend uses this to redirect Company Admin to the upgrade page
                            subscription_inactive: subscriptionInactive,
                        },
                    };

                    if (companyData) {
                        responseData.companyData = companyData;
                        responseData.userData.tenantId = companyData.tenantId;
                    }

                    return { data: responseData };

                case ENUM_USER_TYPE.TENANT_USER:
                    // Employee / Location Admin authentication
                    userData =
                        await this.authService.authenticateTenantUser(
                            authUser
                        );
                    userId = String(userData._id);

                    // Check user status and role
                    if (
                        (userData as IUserDoc).status !==
                        ENUM_USER_STATUS.ACTIVE
                    ) {
                        let tenantInactiveMsg = 'user.error.inactive';
                        const tenantInactiveReason = (userData as IUserDoc).inactive_reason;
                        if (tenantInactiveReason === ENUM_USER_INACTIVE_REASON.SUBSCRIPTION_EXPIRED) {
                            tenantInactiveMsg = 'user.error.subscriptionExpired';
                        } else if (tenantInactiveReason === ENUM_USER_INACTIVE_REASON.COMPANY_SUSPENDED) {
                            tenantInactiveMsg = 'user.error.companySuspended';
                        }
                        throw new ForbiddenException({
                            statusCode:
                                ENUM_USER_STATUS_CODE_ERROR.INACTIVE_FORBIDDEN,
                            message: tenantInactiveMsg,
                        });
                    }

                    if (!userData.role || !userData.role.isActive) {
                        throw new ForbiddenException({
                            statusCode:
                                ENUM_ROLE_STATUS_CODE_ERROR.INACTIVE_FORBIDDEN,
                            message: 'role.error.inactive',
                        });
                    }

                    // Create session and token
                    session = await this.sessionService.create(request, {
                        user: userId,
                    });
                    await this.sessionService.setLoginSession(
                        userData as IUserDoc,
                        session
                    );
                    token = await this.authService.createUnifiedToken(
                        userData,
                        authUser.tenantId,
                        authUser.userType,
                        String(session._id)
                    );

                    // ── Block tenant users (Location Admin / Employee) when the company's
                    //    subscription is inactive. Only Company Admins are allowed in to
                    //    reach the upgrade page.
                    {
                        const companyIdForCheck = (userData as IUserDoc).companyId;
                        if (companyIdForCheck) {
                            try {
                                const companyForCheck = await this.companyService.findOneById(String(companyIdForCheck));
                                if (companyForCheck?.user_id) {
                                    const tenantSub = await this.subscriptionService.findAnyByUserId(String(companyForCheck.user_id));
                                    if (!this.subscriptionService.isSubscriptionActive(tenantSub)) {
                                        throw new ForbiddenException({
                                            statusCode: ENUM_USER_STATUS_CODE_ERROR.INACTIVE_FORBIDDEN,
                                            message: 'Your company\'s subscription is inactive. Please contact your Company Admin to renew.',
                                        });
                                    }
                                }
                            } catch (subErr) {
                                if (subErr instanceof ForbiddenException) throw subErr;
                                // On any other error, fall through and let the rest of the flow run
                            }
                        }
                    }

                    // Fetch company data + subscription tools for the tenant user
                    let tenantCompanyData: IAuthCompanyData | null = null;
                    try {
                        const companyId = (userData as IUserDoc).companyId;
                        if (companyId) {
                            const company = await this.companyService.findOneById(String(companyId));
                            if (company) {
                                // Fetch subscription tools via company admin's user_id
                                let tools = [];
                                try {
                                    const subscription = await this.subscriptionService.findActiveByUserId(String(company.user_id));
                                    if (subscription && subscription.tools) {
                                        tools = subscription.tools;
                                    }
                                } catch {
                                    // No subscription found — tools stays empty
                                }

                                // Remove helpdesk permission if tool not in subscription
                                const helpdeskTool = await this.toolsService.findOne({ slug: 'helpdesk-support-ticket' });
                                if (helpdeskTool) {
                                    const isToolExists = tools.find(
                                        (tool: any) => tool?._id?.toString() === helpdeskTool._id.toString()
                                    );
                                    if (!isToolExists && userData.role?.permissions) {
                                        delete userData.role.permissions.helpdesk_ticket;
                                    }
                                }

                                tenantCompanyData = {
                                    _id: String(company._id),
                                    company_name: company.company_name,
                                    contact_name: company.contact_name,
                                    contact_first_name: company.contact_first_name,
                                    contact_last_name: company.contact_last_name,
                                    email: company.email,
                                    mobile: company.mobile,
                                    country_code: company.country_code,
                                    website: company.website,
                                    tenantId: company.tenantId,
                                    createdAt: company.createdAt,
                                    updatedAt: company.updatedAt,
                                    is_subscribe: company.is_subscribe,
                                    subscription_id: company.subscription_id,
                                    tools: tools,
                                };
                            }
                        }
                    } catch (error) {
                        console.warn(
                            'Failed to fetch company data for Tenant User:',
                            error
                        );
                    }

                    const tenantResponseData: any = {
                        ...token,
                        userData: {
                            _id: userId,
                            name: userData.name,
                            email: userData.email,
                            country_code: (userData as IUserDoc).country_code,
                            mobile: (userData as IUserDoc).mobile,
                            role: userData.role,
                            gender: (userData as IUserDoc).gender,
                            status: (userData as IUserDoc).status,
                            location_id: (userData as any).location_id || null,
                            accessible_locations: (userData as any).accessible_locations || [],
                            createdAt: userData.createdAt,
                            tenantId: authUser.tenantId,
                            userType: ENUM_USER_TYPE.TENANT_USER,
                            company: tenantCompanyData,
                            isSystemUser: false,
                            hasActiveSubscription: false,
                        },
                    };

                    if (tenantCompanyData) {
                        tenantResponseData.companyData = tenantCompanyData;
                        tenantResponseData.userData.tenantId = tenantCompanyData.tenantId;
                    }

                    return { data: tenantResponseData };

                default:
                    throw new BadRequestException({
                        statusCode: ENUM_USER_STATUS_CODE_ERROR.NOT_FOUND,
                        message: 'Invalid user type',
                    });
            }
        } catch (err: unknown) {
            if (
                err instanceof NotFoundException ||
                err instanceof BadRequestException ||
                err instanceof ForbiddenException
            ) {
                throw err;
            }

            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @AuthPublicRegisterDoc()
    @Response('auth.register')
    @HttpCode(HttpStatus.CREATED)
    @Post('/register')
    async register(
        @Body() body: AuthRegisterRequestDto,
        @Req() request: IRequestApp
    ): Promise<IResponse<any>> {
        // Check if user already exists
        this.logger.log(`Checking email existence for: ${body.email}`);
        const saasUserExists = await this.userService.existByEmail(body.email);
        this.logger.log(`Email check results - SaaS: ${saasUserExists}`);

        if (saasUserExists) {
            throw new BadRequestException({
                statusCode: ENUM_USER_STATUS_CODE_ERROR.EMAIL_EXIST,
                message: 'user.error.emailExist',
            });
        }

        // Get the company_admin role
        const companyAdminRole = await this.roleService.findOneByName(
            ENUM_SYSTEM_ROLE.COMPANY_ADMIN
        );
        if (!companyAdminRole) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
            });
        }

        const databaseSession: any = await this.databaseService.createTransaction();

        try {
            this.logger.log(`Starting registration process for: ${body.email}`);

            // Create password hash
            this.logger.debug('Creating password hash...');
            const password = this.authService.createPassword(body.password);
            this.logger.debug('Password hash created successfully');

            // Create user first
            this.logger.log('Creating user...');
            const user = await this.userService.create(
                {
                    email: body.email,
                    name: `${body.fname} ${body.lname}`,
                    first_name: body.fname,
                    last_name: body.lname,
                    role: String(companyAdminRole._id),
                    gender: ENUM_USER_GENDER.MALE, // Default gender
                    country_code: body.country_code,
                    mobile: body.mobile,
                    status: ENUM_USER_STATUS.ACTIVE,
                    roleLevel: companyAdminRole.level,
                    selected_country: body.selected_country,
                    timezone: body.timezone,
                },
                password,
                ENUM_USER_SIGN_UP_FROM.PUBLIC
            );
            //Fetch Agent
            let agentId = null;
            let agentCommission = 0;
            if (body?.referal_code) {
                const agent =
                    await this.userService.findOneActiveAgentByReferalCode(
                        body?.referal_code
                    );
                if (agent) {
                    agentId = agent._id?.toString();
                    agentCommission = agent.commission;
                }
            }
            // Create company
            this.logger.log('Creating company...');
            const company = await this.companyService.create({
                user_id: user._id,
                company_name: body.company_name,
                contact_name: `${body.fname} ${body.lname}`,
                contact_first_name: body.fname,
                contact_last_name: body.lname,
                email: body.email?.toLowerCase(),
                mobile: body.mobile || '',
                country_code: body.country_code || {},
                website: body.website,
                license_number: body.license_number,
                tax_number: body.tax_number,
                selected_country: body.selected_country,
                timezone: body.timezone,
                currency: body.currency,
                address_1: body?.address_1,
                address_2: body?.address_2,
                city: body?.city,
                state: body?.state,
                country: body?.country,
                zipcode: body?.zipcode,
                agent_id: agentId,
                referal_code: body?.referal_code ?? null,
                agent_commission: agentCommission,
            });
            this.logger.log(`Company created successfully: ${company._id}`);

            // Update user with company ID
            this.logger.debug('Updating user with company ID...');
            await this.userService.updateCompanyId(user, String(company._id));
            this.logger.debug('User updated with company ID successfully');

            // Auto-generate code prefixes from company name (first 3 chars uppercase)
            const companyId = String(company._id);
            const namePrefix = (body.company_name || 'COM').replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
            const locationCodePrefix = `${namePrefix}LOC`;
            const employeeCodePrefix = `${namePrefix}EMP`;

            // Create company settings with auto code generation enabled
            try {
                await this.companySettingsService.update(companyId, {
                    location_code_mode: 'auto',
                    location_code_prefix: locationCodePrefix,
                    location_code_next_seq: 1,
                    employee_code_mode: 'auto',
                    employee_code_prefix: employeeCodePrefix,
                    employee_code_next_seq: 1,
                } as any);
                this.logger.log(`Code settings created: LOC=${locationCodePrefix}, EMP=${employeeCodePrefix}`);
            } catch (err) {
                this.logger.warn(`Failed to create code settings: ${err.message}`);
            }

            // Create default location for the company
            try {
                await this.locationService.create(
                    companyId,
                    {
                        location_name: `${body.company_name} - Head Office`,
                        location_code: '', // auto-generated: e.g. STRLOC0001
                        contact_name: `${body.fname} ${body.lname}`,
                        email: body.email,
                        mobile: body.mobile || '',
                        country_code: body.country_code || {},
                        address_line1: body.address_1 || '',
                        address_line2: body.address_2 || '',
                        city: body.city || '',
                        state: body.state || '',
                        country: body.selected_country || body.country || '',
                        postcode: body.zipcode || '',
                        timezone: body.timezone || '',
                        currency: body.currency || '',
                        is_default: true,
                        is_active: true,
                    } as any,
                    String(user._id),
                );
                this.logger.log(`Default location created for company: ${companyId}`);
            } catch (err) {
                this.logger.warn(`Failed to create default location: ${err.message}`);
            }

            // shared_users entry no longer needed — login authenticates directly from users table
            this.logger.log(`User created for email: ${body.email} — shared_users sync skipped`);

            // Get the created user with role information
            const userWithRole: IUserDoc = await this.userService.join(user);

            if (userWithRole.role.name === 'Company Admin') {
                const companyAdminPermissions =
                    await this.authService.CompanyAdminPermissions(
                        userWithRole.role._id?.toString(),
                        userWithRole.role.permissions
                    );
                userWithRole.role.permissions = companyAdminPermissions;
            }

            // Create session
            this.logger.debug('Creating session...');
            const session = await this.sessionService.create(request, {
                user: String(user._id),
            });
            this.logger.debug(`Session created successfully: ${session._id}`);

            this.logger.debug('Setting login session...');
            await this.sessionService.setLoginSession(userWithRole, session);
            this.logger.debug('Login session set successfully');

            const sessId = String(session._id);
            this.logger.debug('Creating unified token...');
            const token = await this.authService.createUnifiedToken(
                userWithRole,
                null,
                ENUM_USER_TYPE.COMPANY_ADMIN,
                sessId
            );
            this.logger.debug('Unified token created successfully');

            // Get updated company data with tenantId
            this.logger.debug('Getting updated company data...');
            const updatedCompany = await this.companyService.findOneById(
                String(company._id)
            );

            const companyData: IAuthCompanyData = {
                _id: String(updatedCompany._id),
                company_name: updatedCompany.company_name,
                contact_name: updatedCompany.contact_name,
                contact_first_name: updatedCompany.contact_first_name,
                contact_last_name: updatedCompany.contact_last_name,
                email: updatedCompany.email,
                mobile: updatedCompany.mobile,
                country_code: updatedCompany.country_code,
                website: updatedCompany.website,
                tenantId: updatedCompany.tenantId,
                createdAt: updatedCompany.createdAt,
                updatedAt: updatedCompany.updatedAt,
            };

            this.logger.log(`Registration completed successfully`, {
                userId: String(userWithRole._id),
                companyId: String(updatedCompany._id),
                companyName: updatedCompany.company_name,
            });

            //Sending Email to User
            try {
                const subject = 'Welcome to PeopleGem';
                await this.nodemailerService.sendEmailWithTemplate(
                    updatedCompany.email,
                    subject,
                    'welcome.hjs',
                    {
                        name: userWithRole.name,
                        email: userWithRole.email,
                        password: body.password,
                        domain: 'https://zonEdge.co',
                    }
                );
            } catch (error) { }

            // Commit transaction - all operations succeeded
            await this.databaseService.commitTransaction(databaseSession);
            this.logger.log('Transaction committed successfully');

            // Return response in original register format but with unified token
            return {
                data: {
                    token,
                    _id: String(userWithRole._id),
                    name: userWithRole.name,
                    email: userWithRole.email,
                    country_code: userWithRole.country_code,
                    mobile: userWithRole.mobile,
                    role: userWithRole.role,
                    gender: userWithRole.gender,
                    status: userWithRole.status,
                    createdAt: userWithRole.createdAt,
                    companyData,
                },
            };
        } catch (err: unknown) {
            // Abort transaction on any error
            await this.databaseService.abortTransaction(databaseSession);
            this.logger.error('Registration failed, transaction aborted', err);

            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @AuthOTPGenerateDoc()
    @Response('auth.otpGenerate')
    @HttpCode(HttpStatus.OK)
    @Post('/otp/generate')
    async generateOTP(
        @Body() { email }: OTPGenerateRequestDto,
        @Req() request: IRequestApp
    ): Promise<IResponse<OTPGenerateResponseDto>> {
        try {
            // Enhanced logging for debugging
            const clientIp = request.ip || request.headers['x-forwarded-for'] || 'unknown';
            const userAgent = request.headers['user-agent'] || 'unknown';

            this.logger.log(`========== OTP GENERATE REQUEST ==========`);
            this.logger.log(`[OTP Generate] Timestamp: ${new Date().toISOString()}`);
            this.logger.log(`[OTP Generate] Client IP: ${clientIp}`);
            this.logger.log(`[OTP Generate] User-Agent: ${userAgent}`);
            this.logger.log(`[OTP Generate] Raw email received: "${email}"`);
            this.logger.log(`[OTP Generate] Email length: ${email?.length}`);
            this.logger.log(`[OTP Generate] Email char codes: ${email?.split('').map(c => c.charCodeAt(0)).join(',')}`);

            // Check if user already exists
            this.logger.log(`[OTP Generate] Checking email existence for: ${email}`);
            const userExists = await this.userService.existByEmail(email);
            this.logger.log(`[OTP Generate] Email check results - UserExists: ${userExists}`);

            if (userExists) {
                this.logger.warn(`[OTP Generate] REJECTED - User already exists: ${email}`);
                throw new BadRequestException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'User already exists',
                });
            }

            this.logger.log(`[OTP Generate] Calling OTP service for: ${email}`);
            const result = await this.otpService.generateOTP(email);
            this.logger.log(`[OTP Generate] OTP service result: success=${result.success}, message=${result.message}`);

            if (!result.success) {
                this.logger.error(`[OTP Generate] FAILED - ${result.message}`);
                throw new BadRequestException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: result.message,
                });
            }

            this.logger.log(`[OTP Generate] SUCCESS - OTP sent to: ${email}`);
            this.logger.log(`==========================================`);

            return {
                data: result.data as OTPGenerateResponseDto,
            };
        } catch (error) {
            this.logger.error(`[OTP Generate] ERROR - ${error.message}`, error.stack);

            if (error instanceof BadRequestException) {
                throw error;
            }

            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'Failed to generate OTP',
                _error: error,
            });
        }
    }

    @AuthOTPVerifyDoc()
    @Response('auth.otpVerify')
    @HttpCode(HttpStatus.OK)
    @Post('/otp/verify')
    async verifyOTP(
        @Body() { email, otp }: OTPVerifyRequestDto,
        @Req() request: IRequestApp
    ): Promise<IResponse<OTPVerifyResponseDto>> {
        try {
            // Enhanced logging for debugging
            const clientIp = request.ip || request.headers['x-forwarded-for'] || 'unknown';
            const userAgent = request.headers['user-agent'] || 'unknown';

            this.logger.log(`========== OTP VERIFY REQUEST ==========`);
            this.logger.log(`[OTP Verify] Timestamp: ${new Date().toISOString()}`);
            this.logger.log(`[OTP Verify] Client IP: ${clientIp}`);
            this.logger.log(`[OTP Verify] User-Agent: ${userAgent}`);
            this.logger.log(`[OTP Verify] Raw email received: "${email}"`);
            this.logger.log(`[OTP Verify] Email length: ${email?.length}`);
            this.logger.log(`[OTP Verify] Email char codes: ${email?.split('').map(c => c.charCodeAt(0)).join(',')}`);
            this.logger.log(`[OTP Verify] OTP received: "${otp}"`);
            this.logger.log(`[OTP Verify] OTP length: ${otp?.length}`);
            this.logger.log(`[OTP Verify] OTP char codes: ${otp?.split('').map(c => c.charCodeAt(0)).join(',')}`);

            this.logger.log(`[OTP Verify] Calling OTP service to verify...`);
            const result = await this.otpService.verifyOTP(email, otp);
            this.logger.log(`[OTP Verify] OTP service result: success=${result.success}, message=${result.message}`);

            if (!result.success) {
                this.logger.error(`[OTP Verify] FAILED - ${result.message} for email: ${email}`);
                this.logger.log(`==========================================`);
                throw new BadRequestException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: result.message,
                });
            }

            this.logger.log(`[OTP Verify] SUCCESS - Email verified: ${email}`);
            this.logger.log(`==========================================`);

            return {
                data: result.data as OTPVerifyResponseDto,
            };
        } catch (error) {
            this.logger.error(`[OTP Verify] ERROR - ${error.message}`, error.stack);

            if (error instanceof BadRequestException) {
                throw error;
            }

            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'Failed to verify OTP',
                _error: error,
            });
        }
    }

    // @HttpCode(HttpStatus.OK)
    // @Post('/test/azure/email')
    // @ApiBody({
    //   description: 'Email and name for user creation',
    //   type: Object,
    //   schema: {
    //     type: 'object',
    //     properties: {
    //       email: {
    //         type: 'string',
    //         example: 'user@example.com',
    //       },
    //       name: {
    //         type: 'string',
    //         example: 'John Doe',
    //       },
    //     },
    //     required: ['email', 'name'],
    //   },
    // })
    // async testAzureEmail(
    //     @Body() { email, name }:{ email: string, name: string }
    // ): Promise<IResponse<any>> {
    //     try {

    //         // const result = await this.azureEmailService.sendEmailWithTemplate(
    //         //     email,
    //         //     name,
    //         //     "STRIVEDGE TEST EMAIL by Kuldeep",
    //         //     'test_email.hjs',
    //         //     {
    //         //         name:"kuldeep"
    //         //     }
    //         // );
    //         const result  = await this.enhancedEmailService.sendEmailWithProvider(
    //             email,
    //             name,
    //             "STRIVEDGE NEW TEST EMAIL by Kuldeep",
    //             'test_email.hjs',
    //             {
    //                 name:"kuldeep"
    //             }
    //         );
    //         console.log("==========================result=========================");
    //         console.log(result);

    //         return {
    //             data: "Email Sent Successfully",
    //         };
    //     } catch (error) {
    //         if (error instanceof BadRequestException) {
    //             throw error;
    //         }

    //         throw new InternalServerErrorException({
    //             statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
    //             message: 'Failed to verify name',
    //             _error: error,
    //         });
    //     }
    // }

    // @Response('auth.otpGenerate')
    // @HttpCode(HttpStatus.OK)
    // @Post('/image/base64/generate')
    // async generateLogoBase64() {
    //     // const imagePath = path.join(process.cwd(), "public", "RansomLogo.png");
    //     // const outputPath = path.join(process.cwd(), "public", "RansomLogoImageBase64.txt");

    //     // // 2️⃣ Read the image file
    //     // const imageBuffer = fs.readFileSync(imagePath);

    //     // // 3️⃣ Convert image to Base64
    //     // const base64Image = imageBuffer.toString("base64");

    //     // // Optional: include MIME type prefix
    //     // const base64WithPrefix = `data:image/png;base64,${base64Image}`;

    //     // // 4️⃣ Write the Base64 string to a text file
    //     // fs.writeFileSync(outputPath, base64WithPrefix, "utf8");

    //     // console.log(`✅ Base64 image saved to: ${outputPath}`);

    //     // // 1️⃣ Define the path to your file
    //     // const base64FilePath = path.join(process.cwd(), "public", "RansomLogoImageBase64.txt");
    //     // const base64Data = fs.readFileSync(base64FilePath, "utf8");

    //     // // 2️⃣ Read the file content

    //     // // 3️⃣ Store it in a variable (you already have it!)
    //     // console.log("✅ Base64 data loaded:");
    //     // console.log(base64Data.substring(0, 100) + "..."); // print first 100 ch
    //     // return {
    //     //     data: base64Data
    //     // }
    // }
}
