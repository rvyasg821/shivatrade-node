import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import verifyAppleToken from 'verify-apple-id-token';
import { LoginTicket, OAuth2Client, TokenPayload } from 'google-auth-library';
import { HelperDateService } from '@common/helper/services/helper.date.service';
import { Algorithm } from 'jsonwebtoken';
import { HelperHashService } from '@common/helper/services/helper.hash.service';
import { HelperStringService } from '@common/helper/services/helper.string.service';
import { IAuthService } from '@modules/auth/interfaces/auth.service.interface';
import {
    IAuthJwtAccessTokenPayload,
    IAuthJwtRefreshTokenPayload,
    IAuthPassword,
    IAuthPasswordOptions,
    IAuthSocialApplePayload,
    IAuthSocialGooglePayload,
} from '@modules/auth/interfaces/auth.interface';
import {
    IUnifiedAuthJwtAccessTokenPayload,
    IUnifiedAuthJwtRefreshTokenPayload,
    ITenantUserDoc,
    IAuthenticatedUser,
} from '@modules/auth/interfaces/auth.unified.interface';
import { ENUM_AUTH_LOGIN_FROM } from '@modules/auth/enums/auth.enum';
import { IUserDoc } from '@modules/user/interfaces/user.interface';
import { AuthLoginResponseDto } from '@modules/auth/dtos/response/auth.login.response.dto';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ENUM_USER_TYPE } from '@common/enums/user-type.enum';
import { UserService } from '@modules/user/services/user.service';
import { ENUM_USER_STATUS_CODE_ERROR } from '@modules/user/enums/user.status-code.enum';
import { ENUM_UNIFIED_AUTH_STATUS_CODE_ERROR } from '@modules/auth/enums/auth.unified.status-code.enum';
import { SYSTEM_USER_DEFAULT_PERMISSIONS } from '@modules/role/constants/system-users.permissions copy';
import { RoleService } from '@modules/role/services/role.service';
import { COMPANY_DEFAULT_PERMISSIONS } from '@modules/role/constants/company.permissions';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { CompanyService } from '@modules/company/services/company.service';
// import { CompanyService } from '@modules/company/services/company.service';
import { AuditLogService } from '@modules/tracking/services/audit-log.service';
import { ENUM_AUDIT_ACTION } from '@modules/tracking/repository/entities/audit-log.entity';

@Injectable()
export class AuthService implements IAuthService {
    private readonly logger = new Logger(AuthService.name);

    // jwt
    private readonly jwtAccessTokenSecret: string;
    private readonly jwtAccessTokenExpirationTime: number;

    private readonly jwtRefreshTokenSecret: string;
    private readonly jwtRefreshTokenExpirationTime: number;

    private readonly jwtPrefix: string;
    private readonly jwtAudience: string;
    private readonly jwtIssuer: string;
    private readonly jwtAlgorithm: Algorithm;

    // password
    private readonly passwordExpiredIn: number;
    private readonly passwordExpiredTemporary: number;
    private readonly passwordSaltLength: number;

    private readonly passwordAttempt: boolean;
    private readonly passwordMaxAttempt: number;

    // apple
    private readonly appleClientId: string;
    private readonly appleSignInClientId: string;

    // google
    private readonly googleClient: OAuth2Client;

    constructor(
        private readonly helperHashService: HelperHashService,
        private readonly helperDateService: HelperDateService,
        private readonly helperStringService: HelperStringService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly companyService: CompanyService,
        private readonly auditLogService: AuditLogService,
    ) {
        this.jwtAccessTokenSecret = this.configService.get<string>(
            'auth.jwt.accessToken.secret'
        );
        this.jwtAccessTokenExpirationTime = this.configService.get<number>(
            'auth.jwt.accessToken.expirationTime'
        );

        this.jwtRefreshTokenSecret = this.configService.get<string>(
            'auth.jwt.refreshToken.secret'
        );
        this.jwtRefreshTokenExpirationTime = this.configService.get<number>(
            'auth.jwt.refreshToken.expirationTime'
        );

        this.jwtPrefix = this.configService.get<string>('auth.jwt.prefix');
        this.jwtAudience = this.configService.get<string>('auth.jwt.audience');
        this.jwtIssuer = this.configService.get<string>('auth.jwt.issuer');
        this.jwtAlgorithm = this.configService.get<Algorithm>('auth.jwt.algorithm');

        // password
        this.passwordExpiredIn = this.configService.get<number>(
            'auth.password.expiredIn'
        );
        this.passwordExpiredTemporary = this.configService.get<number>(
            'auth.password.expiredInTemporary'
        );
        this.passwordSaltLength = this.configService.get<number>(
            'auth.password.saltLength'
        );

        this.passwordAttempt = this.configService.get<boolean>(
            'auth.password.attempt'
        );
        this.passwordMaxAttempt = this.configService.get<number>(
            'auth.password.maxAttempt'
        );

        // apple
        this.appleClientId = this.configService.get<string>(
            'auth.apple.clientId'
        );
        this.appleSignInClientId = this.configService.get<string>(
            'auth.apple.signInClientId'
        );

        // google
        this.googleClient = new OAuth2Client(
            this.configService.get<string>('auth.google.clientId'),
            this.configService.get<string>('auth.google.clientSecret')
        );
    }

    createAccessToken(
        subject: string,
        payload: IAuthJwtAccessTokenPayload
    ): string {
        return this.jwtService.sign(payload, {
            secret: this.jwtAccessTokenSecret,
            expiresIn: this.jwtAccessTokenExpirationTime,
            audience: this.jwtAudience,
            issuer: this.jwtIssuer,
            subject,
            algorithm: this.jwtAlgorithm,
        } as JwtSignOptions);
    }

    validateAccessToken(subject: string, token: string): boolean {
        try {
            this.jwtService.verify(token, {
                secret: this.jwtAccessTokenSecret,
                algorithms: [this.jwtAlgorithm],
                audience: this.jwtAudience,
                issuer: this.jwtIssuer,
                subject,
            });

            return true;
        } catch {
            return false;
        }
    }

    payload<T = any>(token: string): T {
        return this.jwtService.decode<T>(token);
    }

    createRefreshToken(
        subject: string,
        payload: IAuthJwtRefreshTokenPayload
    ): string {
        return this.jwtService.sign(payload, {
            secret: this.jwtRefreshTokenSecret,
            expiresIn: this.jwtRefreshTokenExpirationTime,
            audience: this.jwtAudience,
            issuer: this.jwtIssuer,
            subject,
            algorithm: this.jwtAlgorithm,
        } as JwtSignOptions);
    }

    validateRefreshToken(subject: string, token: string): boolean {
        try {
            this.jwtService.verify(token, {
                secret: this.jwtRefreshTokenSecret,
                algorithms: [this.jwtAlgorithm],
                audience: this.jwtAudience,
                issuer: this.jwtIssuer,
                subject,
            });

            return true;
        } catch {
            return false;
        }
    }

    validateUser(passwordString: string, passwordHash: string): boolean {
        return this.helperHashService.bcryptCompare(
            passwordString,
            passwordHash
        );
    }

    async createPayloadAccessToken(
        data: IUserDoc,
        session: string,
        loginDate: Date,
        loginFrom: ENUM_AUTH_LOGIN_FROM,
    ): Promise<IAuthJwtAccessTokenPayload> {
        const userId = String(data._id);
        const roleId = String(data.role._id);
        const roleName = data.role.name;
        const roleLevel = data.role.level || 1;

        // Build assigned locations: primary + accessible_locations (for Location Admin multi-location)
        const primaryLocationId = data?.location_id ? String(data.location_id) : '';
        const accessibleLocs = (data as any)?.accessible_locations || [];
        const assignedLocations = [...new Set([
            ...(primaryLocationId ? [primaryLocationId] : []),
            ...accessibleLocs.map(String),
        ])];

        return {
            user: userId,
            role: roleId,
            roleName,
            roleLevel,
            companyId: data?.companyId || '',
            locationId: primaryLocationId,
            assignedLocations,
            email: data.email,
            session,
            loginDate,
            loginFrom,
        };
    }

    createPayloadRefreshToken({
        user,
        session,
        loginFrom,
        loginDate,
        roleLevel,
    }: IAuthJwtAccessTokenPayload): IAuthJwtRefreshTokenPayload {
        return {
            user,
            session,
            loginFrom,
            loginDate,
            roleLevel,
        };
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

    createPasswordRandom(): string {
        return this.helperStringService.random(10);
    }

    checkPasswordExpired(passwordExpired: Date): boolean {
        const today: Date = this.helperDateService.create();
        const passwordExpiredConvert: Date =
            this.helperDateService.create(passwordExpired);

        return today > passwordExpiredConvert;
    }

    async createToken(user: IUserDoc, session: string,): Promise<AuthLoginResponseDto> {
        const loginDate = this.helperDateService.create();
        const roleType = user.role?.type;
        const userId = String(user._id);

        const payloadAccessToken: IAuthJwtAccessTokenPayload =
            await this.createPayloadAccessToken(
                user,
                session,
                loginDate,
                ENUM_AUTH_LOGIN_FROM.CREDENTIAL,
            );
        const accessToken: string = this.createAccessToken(
            userId,
            payloadAccessToken
        );

        const payloadRefreshToken: IAuthJwtRefreshTokenPayload =
            this.createPayloadRefreshToken(payloadAccessToken);
        const refreshToken: string = this.createRefreshToken(
            userId,
            payloadRefreshToken
        );

        return {
            tokenType: this.jwtPrefix,
            // roleType,
            expiresIn: this.jwtAccessTokenExpirationTime,
            accessToken,
            refreshToken,
        };
    }

    async refreshToken(
        user: IUserDoc,
        refreshTokenFromRequest: string,
        companyId?: string
    ): Promise<AuthLoginResponseDto> {
        const roleType = user.role?.type;
        const userId = String(user._id);

        const payloadRefreshToken = this.payload<IAuthJwtRefreshTokenPayload>(
            refreshTokenFromRequest
        );
        const payloadAccessToken: IAuthJwtAccessTokenPayload =
            await this.createPayloadAccessToken(
                user,
                payloadRefreshToken.session,
                payloadRefreshToken.loginDate,
                payloadRefreshToken.loginFrom,
            );
        const accessToken: string = this.createAccessToken(
            userId,
            payloadAccessToken
        );

        return {
            tokenType: this.jwtPrefix,
            // roleType,
            expiresIn: this.jwtAccessTokenExpirationTime,
            accessToken,
            refreshToken: refreshTokenFromRequest,
        };
    }

    getPasswordAttempt(): boolean {
        return this.passwordAttempt;
    }

    getPasswordMaxAttempt(): number {
        return this.passwordMaxAttempt;
    }

    async appleGetTokenInfo(idToken: string): Promise<IAuthSocialApplePayload> {
        const payload = await verifyAppleToken({
            idToken,
            clientId: [this.appleClientId, this.appleSignInClientId],
        });

        return { email: payload.email, emailVerified: payload.email_verified };
    }

    async googleGetTokenInfo(
        idToken: string
    ): Promise<IAuthSocialGooglePayload> {
        const login: LoginTicket = await this.googleClient.verifyIdToken({
            idToken: idToken,
        });
        const payload: TokenPayload = login.getPayload();

        return {
            email: payload.email,
            emailVerified: true,
            name: payload.name,
            photo: payload.picture,
        };
    }

    // Unified Authentication Methods

    /**
     * Fire-and-forget audit row for an authentication event (login / failed
     * login), surfaced in the SUPER_ADMIN activity feed. Never throws — sign-in
     * must not fail because the activity log did. On failed logins against an
     * unknown account there is no `userId`, so the email in the summary is the
     * only thing that identifies the attempt.
     */
    private recordAuthEvent(
        action: ENUM_AUDIT_ACTION,
        opts: {
            email: string;
            userId?: string;
            companyId?: string;
            reason?: string;
        }
    ): void {
        this.auditLogService.recordSummary({
            entity_name: 'AuthEntity',
            entity_label: opts.email,
            action,
            user_id: opts.userId,
            company_id: opts.companyId,
            summary: opts.reason
                ? { email: opts.email, reason: opts.reason }
                : { email: opts.email },
        });
    }

    /**
     * Authenticate directly from the users table.
     * Derives userType from role name.
     */
    async authenticateUser(email: string, password: string): Promise<IAuthenticatedUser> {
        this.logger.log(`Attempting authentication for email: ${email}`);

        try {
            // Authenticate directly from users table
            // Try exact match first, then case-insensitive
            let user = await this.userService.findOneUserByEmailWithPassword(email);
            if (!user) {
                user = await this.userService.findOneUserByEmailWithPassword(email.toLowerCase());
            }

            if (!user || !user.password) {
                this.logger.warn(`User not found for email: ${email}`);
                this.recordAuthEvent(ENUM_AUDIT_ACTION.LOGIN_FAILED, {
                    email,
                    reason: 'no_account',
                });
                throw new NotFoundException({
                    statusCode: ENUM_UNIFIED_AUTH_STATUS_CODE_ERROR.SHARED_USER_NOT_FOUND,
                    message: 'User not found',
                });
            }

            // Check if user is soft-deleted
            if ((user as any).deleted === true) {
                throw new NotFoundException({
                    statusCode: ENUM_UNIFIED_AUTH_STATUS_CODE_ERROR.SHARED_USER_NOT_FOUND,
                    message: 'User not found',
                });
            }

            // Brute-force lockout (SECURITY_HARDENING_PLAN.md C1) — the
            // `passwordAttempt`/`maxAttempt` fields + config already existed
            // but were never checked on this path. Locked out once the
            // counter reaches maxAttempt; unlocks via the existing
            // admin-reset-password flow (already calls resetPasswordAttempt)
            // or a normal successful login (reset below).
            if (
                this.passwordAttempt &&
                (user as any).passwordAttempt >= this.passwordMaxAttempt
            ) {
                this.logger.warn(`Account locked (too many attempts): ${email}`);
                this.recordAuthEvent(ENUM_AUDIT_ACTION.LOGIN_FAILED, {
                    email: user.email || email,
                    userId: String(user._id),
                    companyId: (user as any).companyId || undefined,
                    reason: 'account_locked',
                });
                throw new ForbiddenException({
                    statusCode: ENUM_USER_STATUS_CODE_ERROR.PASSWORD_ATTEMPT_MAX,
                    message: 'auth.error.passwordAttemptMax',
                });
            }

            const isValidPassword = this.validateUser(password, user.password);
            if (!isValidPassword) {
                this.logger.warn(`Invalid credentials for: ${email}`);
                if (this.passwordAttempt) {
                    await this.userService.increasePasswordAttempt(user);
                }
                this.recordAuthEvent(ENUM_AUDIT_ACTION.LOGIN_FAILED, {
                    email: user.email || email,
                    userId: String(user._id),
                    companyId: (user as any).companyId || undefined,
                    reason: 'wrong_password',
                });
                throw new BadRequestException({
                    statusCode: ENUM_UNIFIED_AUTH_STATUS_CODE_ERROR.SHARED_USER_INVALID_CREDENTIALS,
                    message: 'Invalid credentials',
                });
            }

            if (this.passwordAttempt && (user as any).passwordAttempt > 0) {
                await this.userService.resetPasswordAttempt(user);
            }

            // Derive userType from role
            const userWithRole = await this.userService.findOneById(String(user._id), { join: true });
            const roleName = (userWithRole as any)?.role?.name || '';

            // Block login for roles whose login is not yet enabled (e.g. Vendor).
            // Returns the same error shape as wrong-password to avoid leaking
            // the existence of a vendor account.
            if (!this.isLoginAllowedForRole(roleName)) {
                this.logger.warn(`Login blocked for role '${roleName}': ${email}`);
                this.recordAuthEvent(ENUM_AUDIT_ACTION.LOGIN_FAILED, {
                    email: user.email || email,
                    userId: String(user._id),
                    companyId: (user as any).companyId || undefined,
                    reason: 'role_blocked',
                });
                throw new BadRequestException({
                    statusCode: ENUM_UNIFIED_AUTH_STATUS_CODE_ERROR.SHARED_USER_INVALID_CREDENTIALS,
                    message: 'Invalid credentials',
                });
            }

            const userType = this.deriveUserType(roleName);

            this.logger.log(`Auth successful for: ${email} (role: ${roleName}, type: ${userType})`);

            this.recordAuthEvent(ENUM_AUDIT_ACTION.LOGIN, {
                email: user.email || email,
                userId: String(user._id),
                companyId: (user as any).companyId || undefined,
            });

            return {
                _id: String(user._id),
                email: user.email,
                userType,
                companyId: (user as any).companyId || null,
                tenantId: null,
            };
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }
            this.logger.error(`Authentication failed for ${email}:`, error?.message);
            throw new NotFoundException({
                statusCode: ENUM_UNIFIED_AUTH_STATUS_CODE_ERROR.SHARED_USER_NOT_FOUND,
                message: 'User not found',
            });
        }
    }

    /**
     * Roles that cannot log in or request password resets yet.
     * Remove a role from this list to enable login + reset for it.
     */
    private static readonly LOGIN_BLOCKED_ROLES: string[] = [
        ENUM_SYSTEM_ROLE.VENDOR,
        ENUM_SYSTEM_ROLE.CUSTOMER,
    ];

    isLoginAllowedForRole(roleName: string): boolean {
        return !AuthService.LOGIN_BLOCKED_ROLES.includes(roleName);
    }

    deriveUserType(roleName: string): ENUM_USER_TYPE {
        if (roleName === 'Super Admin' || roleName === 'Admin' || roleName === 'Agent') {
            return ENUM_USER_TYPE.ADMIN;
        } else if (roleName === 'Company Admin') {
            return ENUM_USER_TYPE.COMPANY_ADMIN;
        }
        return ENUM_USER_TYPE.TENANT_USER;
    }

    async authenticateSuperAdmin(authUser: IAuthenticatedUser): Promise<IUserDoc> {
        this.logger.log(`Authenticating Super Admin: ${authUser.email}`);

        if (authUser.userType !== ENUM_USER_TYPE.ADMIN) {
            this.logger.error(`Invalid user type for Super Admin authentication: ${authUser.userType}`);
            throw new BadRequestException({
                statusCode: ENUM_UNIFIED_AUTH_STATUS_CODE_ERROR.INVALID_USER_TYPE,
                message: 'Invalid user type for Super Admin authentication',
            });
        }

        try {
            const user = await this.userService.findOneUserByEmailWithPassword(authUser.email);
            if (!user) {
                this.logger.error(`Super Admin user not found in database: ${authUser.email}`);
                throw new NotFoundException({
                    statusCode: ENUM_UNIFIED_AUTH_STATUS_CODE_ERROR.SHARED_USER_NOT_FOUND,
                    message: 'Super Admin user not found in database',
                });
            }

            const userWithRole = await this.userService.join(user);
            if (userWithRole.role.name === 'Admin') {
                const superAdminPermissions = await this.superAdminPermissions(
                    userWithRole.role._id?.toString(),
                    userWithRole.role.permissions
                );
                userWithRole.role.permissions = superAdminPermissions;
            }
            this.logger.log(`Super Admin authentication successful: ${authUser.email}`);
            return userWithRole;
        } catch (error) {
            this.logger.error(`Super Admin authentication failed for ${authUser.email}:`, error);
            throw error;
        }
    }

    async authenticateCompanyAdmin(authUser: IAuthenticatedUser): Promise<IUserDoc> {
        this.logger.log(`Authenticating Company Admin: ${authUser.email}`);

        if (authUser.userType !== ENUM_USER_TYPE.COMPANY_ADMIN) {
            this.logger.error(`Invalid user type for Company Admin authentication: ${authUser.userType}`);
            throw new BadRequestException({
                statusCode: ENUM_UNIFIED_AUTH_STATUS_CODE_ERROR.INVALID_USER_TYPE,
                message: 'Invalid user type for Company Admin authentication',
            });
        }

        try {
            let user = await this.userService.findOneByEmailWithPassword(authUser.email);

            // Fallback: try case-insensitive lookup if exact match failed
            if (!user) {
                this.logger.warn(`Exact email lookup failed for Company Admin: ${authUser.email}. Trying case-insensitive search.`);
                const regex = new RegExp(`^${authUser.email.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i');
                user = await this.userService.findOne({ email: { $regex: regex } });
            }

            if (!user) {
                this.logger.error(`Company Admin user not found in database: ${authUser.email}`);
                throw new NotFoundException({
                    statusCode: ENUM_UNIFIED_AUTH_STATUS_CODE_ERROR.SHARED_USER_NOT_FOUND,
                    message: 'Company Admin user not found in database',
                });
            }

            const userWithRole = await this.userService.join(user);
            if (userWithRole.role.name === 'Company Admin') {
                const companyAdminPermissions = await this.CompanyAdminPermissions(
                    userWithRole.role._id?.toString(),
                    userWithRole.role.permissions
                );
                userWithRole.role.permissions = companyAdminPermissions;
            }
            this.logger.log(`Company Admin authentication successful: ${authUser.email}`);
            return userWithRole;
        } catch (error) {
            this.logger.error(`Company Admin authentication failed for ${authUser.email}:`, error);
            throw error;
        }
    }

    async authenticateTenantUser(authUser: IAuthenticatedUser): Promise<IUserDoc> {
        this.logger.log(`Authenticating Tenant User (Employee/Location Admin): ${authUser.email}`);

        if (authUser.userType !== ENUM_USER_TYPE.TENANT_USER) {
            this.logger.error(`Invalid user type for Tenant User authentication: ${authUser.userType}`);
            throw new BadRequestException({
                statusCode: ENUM_UNIFIED_AUTH_STATUS_CODE_ERROR.INVALID_USER_TYPE,
                message: 'Invalid user type for Tenant User authentication',
            });
        }

        try {
            let user = await this.userService.findOneByEmailWithPassword(authUser.email);

            // Fallback: try case-insensitive lookup
            if (!user) {
                this.logger.warn(`Exact email lookup failed for Tenant User: ${authUser.email}. Trying case-insensitive search.`);
                const regex = new RegExp(`^${authUser.email.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i');
                user = await this.userService.findOne({ email: { $regex: regex } });
            }

            if (!user) {
                this.logger.error(`Tenant User not found in database: ${authUser.email}`);
                throw new NotFoundException({
                    statusCode: ENUM_UNIFIED_AUTH_STATUS_CODE_ERROR.SHARED_USER_NOT_FOUND,
                    message: 'User not found in database',
                });
            }

            const userWithRole = await this.userService.join(user);
            this.logger.log(`Tenant User authentication successful: ${authUser.email} (role: ${userWithRole.role?.name})`);
            return userWithRole;
        } catch (error) {
            this.logger.error(`Tenant User authentication failed for ${authUser.email}:`, error);
            throw error;
        }
    }

    async createUnifiedPayloadAccessToken(
        userData: IUserDoc | ITenantUserDoc,
        tenantId: string | null,
        userType: ENUM_USER_TYPE,
        session: string,
        loginDate: Date,
        loginFrom: ENUM_AUTH_LOGIN_FROM
    ): Promise<IUnifiedAuthJwtAccessTokenPayload> {
        const userId = String(userData._id);
        const roleId = String(userData.role._id);
        const roleName = userData.role.name;
        //@ts-ignore
        const roleLevel = userData.role.roleLevel ?? userData.role.level;

        return {
            user: userId,
            role: roleId,
            roleName,
            roleLevel,
            companyId: (userData as IUserDoc)?.companyId || '',
            locationId: (userData as any)?.location_id ? String((userData as any).location_id._id || (userData as any).location_id) : undefined,
            email: userData.email,
            session,
            loginDate,
            loginFrom,
            tenantId,
            userType,
        };
    }

    createUnifiedPayloadRefreshToken({
        user,
        session,
        loginFrom,
        loginDate,
        tenantId,
        userType,
        roleLevel,
    }: IUnifiedAuthJwtAccessTokenPayload): IUnifiedAuthJwtRefreshTokenPayload {
        return {
            user,
            session,
            loginFrom,
            loginDate,
            tenantId,
            userType,
            roleLevel,
        };
    }

    async createUnifiedToken(
        userData: IUserDoc | ITenantUserDoc,
        tenantId: string | null,
        userType: ENUM_USER_TYPE,
        session: string
    ): Promise<AuthLoginResponseDto> {
        const loginDate = this.helperDateService.create();
        const userId = String(userData._id);

        const payloadAccessToken: IUnifiedAuthJwtAccessTokenPayload =
            await this.createUnifiedPayloadAccessToken(
                userData,
                tenantId,
                userType,
                session,
                loginDate,
                ENUM_AUTH_LOGIN_FROM.CREDENTIAL
            );

        const accessToken: string = this.createAccessToken(
            userId,
            payloadAccessToken
        );

        const payloadRefreshToken: IUnifiedAuthJwtRefreshTokenPayload =
            this.createUnifiedPayloadRefreshToken(payloadAccessToken);
        const refreshToken: string = this.createRefreshToken(
            userId,
            payloadRefreshToken
        );

        return {
            tokenType: this.jwtPrefix,
            expiresIn: this.jwtAccessTokenExpirationTime,
            accessToken,
            refreshToken,
        };
    }

    async superAdminPermissions(
        roleId: string,
        adminRoles: Record<string, Record<string, boolean>>
    ): Promise<Record<string, Record<string, boolean>>> {
        // Super Admin always gets full access — return synced permissions
        return this.roleService.syncPermissions(adminRoles);
    }

    async CompanyAdminPermissions(
        roleId: string,
        adminRoles: Record<string, Record<string, boolean>>
    ): Promise<Record<string, Record<string, boolean>>> {
        // Return the actual DB permissions as-is — Super Admin may have configured these.
        // syncPermissions ensures any missing modules are filled with false defaults.
        return this.roleService.syncPermissions(adminRoles);
    }

    // Cross-login token methods
    createCrossLoginToken(payload: any): string {
        const secret = this.configService.get<string>('auth.crossLogin.secret') || this.jwtAccessTokenSecret;
        const expiresIn = this.configService.get<number>('auth.crossLogin.expiresIn') || 300; // 5 minutes default

        return this.jwtService.sign(payload, {
            secret,
            expiresIn,
            algorithm: this.jwtAlgorithm,
        });
    }

    validateCrossLoginToken(token: string): any {
        try {
            const secret = this.configService.get<string>('auth.crossLogin.secret') || this.jwtAccessTokenSecret;

            return this.jwtService.verify(token, {
                secret,
                algorithms: [this.jwtAlgorithm],
            });
        } catch (error) {
            this.logger.error('Cross-login token validation failed:', error);
            throw new BadRequestException('Invalid or expired cross-login token');
        }
    }

    getCrossAppConfig(): any {
        return {
            saasAppUrl: this.configService.get<string>('app.saasUrl') || process.env.SAAS_APP_URL || 'http://localhost:3000',
            appointmentAppUrl: this.configService.get<string>('app.appointmentUrl') || process.env.APPOINTMENT_APP_URL || 'http://localhost:3001',
            crossLoginSecret: this.configService.get<string>('auth.crossLogin.secret') || this.jwtAccessTokenSecret,
            crossLoginExpiresIn: this.configService.get<number>('auth.crossLogin.expiresIn') || 300,
        };
    }

}
