import {
    IDatabaseCreateOptions,
    IDatabaseExistsOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseUpdateOptions,
} from '@common/database/interfaces/database.interface';
import {
    SharedUserDoc,
    SharedUserEntity,
    ENUM_SHARED_USER_TYPE,
} from '@modules/shared-users/repository/entities/shared-user.entity';

export interface ISharedUserService {
    findByEmail(
        email: string,
        options?: IDatabaseFindOneOptions
    ): Promise<SharedUserDoc | null>;

    findByEmailAndUserType(
        email: string,
        userType: ENUM_SHARED_USER_TYPE,
        options?: IDatabaseFindOneOptions
    ): Promise<SharedUserDoc | null>;

    findByTenantId(
        tenantId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<SharedUserDoc[]>;

    findByUserType(
        userType: ENUM_SHARED_USER_TYPE,
        options?: IDatabaseFindAllOptions
    ): Promise<SharedUserDoc[]>;

    existsByEmail(
        email: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean>;

    create(
        data: Partial<SharedUserEntity>,
        options?: IDatabaseCreateOptions
    ): Promise<SharedUserDoc>;

    updateByEmail(
        email: string,
        updateData: Partial<SharedUserEntity>,
        options?: IDatabaseUpdateOptions
    ): Promise<SharedUserDoc | null>;

    deleteByEmail(email: string): Promise<boolean>;

    deleteByEmails(emails: string[]): Promise<number>;

    deleteByTenantId(tenantId: string): Promise<number>;

    deleteByCompanyId(companyId: string): Promise<number>;

    getTotal(options?: IDatabaseGetTotalOptions): Promise<number>;

    existsByEmailExceptOriginalUserId(
        email: string,
        originalUserId?: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean>;
}