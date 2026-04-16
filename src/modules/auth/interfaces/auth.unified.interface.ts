import {
    IAuthJwtAccessTokenPayload,
    IAuthJwtRefreshTokenPayload,
} from '@modules/auth/interfaces/auth.interface';
import { ENUM_USER_TYPE } from '@common/enums/user-type.enum';

export interface IUnifiedAuthJwtAccessTokenPayload
    extends IAuthJwtAccessTokenPayload {
    tenantId: string | null;
    userType: ENUM_USER_TYPE;
}

export interface IUnifiedAuthJwtRefreshTokenPayload
    extends IAuthJwtRefreshTokenPayload {
    tenantId: string | null;
    userType: ENUM_USER_TYPE;
}

export interface IAuthenticatedUser {
    _id: string;
    email: string;
    userType: ENUM_USER_TYPE;
    companyId: string | null;
    tenantId: string | null;
}

export interface ITenantUserDoc {
    _id: string;
    email: string;
    name: string;
    role: {
        _id: string;
        name: string;
        type: string;
        isActive: boolean;
        roleLevel: number;
    };
    location_id?: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}
