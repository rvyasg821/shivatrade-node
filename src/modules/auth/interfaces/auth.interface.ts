import { ENUM_AUTH_LOGIN_FROM } from '@modules/auth/enums/auth.enum';
import { ENUM_USER_TYPE } from '@common/enums/user-type.enum';

export interface IAuthPassword {
    salt: string;
    passwordHash: string;
    passwordExpired: Date;
    passwordCreated: Date;
}

export interface IAuthPasswordOptions {
    temporary: boolean;
}

export interface IAuthJwtTermPolicyPayload {
    term: boolean;
    privacy: boolean;
    marketing: boolean;
    cookies: boolean;
}

export interface IAuthJwtAccessTokenPayload {
    loginDate: Date;
    loginFrom: ENUM_AUTH_LOGIN_FROM;
    user: string;
    email: string;
    role: string;
    roleName: string;
    roleLevel: number;
    companyId: string;
    locationId?: string;
    tenantId?: string;
    userType?: ENUM_USER_TYPE;
    impersonatedBy?: string;
    assignedLocations?: string[];
    session: string;
    iat?: number;
    nbf?: number;
    exp?: number;
    aud?: string;
    iss?: string;
    sub?: string;
}

export type IAuthJwtRefreshTokenPayload = Omit<
    IAuthJwtAccessTokenPayload,
    'role' | 'roleName' | 'companyId' | 'type' | 'email'
>;

export interface IAuthSocialGooglePayload
    extends Pick<IAuthJwtAccessTokenPayload, 'email'> {
    name: string;
    photo: string;
    emailVerified: boolean;
}

export type IAuthSocialApplePayload = Pick<
    IAuthSocialGooglePayload,
    'email' | 'emailVerified'
>;
