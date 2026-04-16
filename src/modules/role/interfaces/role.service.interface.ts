import {
    IDatabaseCreateManyOptions,
    IDatabaseCreateOptions,
    IDatabaseDeleteManyOptions,
    IDatabaseDeleteOptions,
    IDatabaseExistsOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';
import { RoleCreateRequestDto } from '@modules/role/dtos/request/role.create.request.dto';
import { RoleUpdateRequestDto } from '@modules/role/dtos/request/role.update.request.dto';
import { RoleGetResponseDto } from '@modules/role/dtos/response/role.get.response.dto';
import { RoleListResponseDto } from '@modules/role/dtos/response/role.list.response.dto';
import { RoleShortResponseDto } from '@modules/role/dtos/response/role.short.response.dto';
import {
    RoleDoc,
    RoleEntity,
} from '@modules/role/repository/entities/role.entity';
import { ENUM_ROLE_TYPE } from '../enums/role.enum';
import { RoleCreateDefaultRequestDto } from '../dtos/request/role.create-default.request.dto';

export interface IRoleService {
    findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<RoleDoc[]>;
    getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;
    findAllActive(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<RoleDoc[]>;
    getTotalActive(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;
    findAllActiveByType(
        type: ENUM_ROLE_TYPE,
        options?: IDatabaseFindAllOptions
    ): Promise<RoleDoc[]>;
    findAllByTypes(
        types: string[],
        options?: IDatabaseFindAllOptions
    ): Promise<RoleDoc[]>;
    findOneById(_id: string, options?: IDatabaseOptions): Promise<RoleDoc>;
    findOne(
        find: Record<string, any>,
        options?: IDatabaseOptions
    ): Promise<RoleDoc>;
    findOneByName(name: string, options?: IDatabaseOptions): Promise<RoleDoc>;
    findOneActiveById(
        _id: string,
        options?: IDatabaseOptions
    ): Promise<RoleDoc>;
    existByName(
        name: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean>;
    existByNameInScope(
        name: string,
        companyId: string | null,
        excludeId?: string
    ): Promise<boolean>;
    create(
        { name, description, type, companyId, permissions }: RoleCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<RoleDoc>;
    update(
        repository: RoleDoc,
        { permissions, name, type, description, companyId }: RoleUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<RoleDoc>;
    active(
        repository: RoleDoc,
        options?: IDatabaseSaveOptions
    ): Promise<RoleDoc>;
    inactive(
        repository: RoleDoc,
        options?: IDatabaseSaveOptions
    ): Promise<RoleDoc>;
    delete(
        repository: RoleDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<boolean>;
    deleteMany(
        find?: Record<string, any>,
        options?: IDatabaseDeleteManyOptions
    ): Promise<boolean>;
    createMany(
        data: RoleCreateRequestDto[],
        options?: IDatabaseCreateManyOptions
    ): Promise<boolean>;
    createManyDefaultRole(
        data: RoleCreateDefaultRequestDto[],
        options?: IDatabaseCreateManyOptions
    ): Promise<boolean>;
    mapList(roles: RoleDoc[] | RoleEntity[]): RoleListResponseDto[];
    mapGet(role: RoleDoc | RoleEntity): RoleGetResponseDto;
    mapShort(roles: RoleDoc[] | RoleEntity[]): RoleShortResponseDto[];

    // Permission management methods
    getDefaultPermissions(): Record<string, Record<string, boolean>>;
    syncPermissions(currentPermissions: Record<string, Record<string, boolean>>): Record<string, Record<string, boolean>>;
    syncAllRolePermissions(): Promise<boolean>;
    updatePermissionsById(roleId: string, permissions: Record<string, Record<string, boolean>>): Promise<void>;

    // Hierarchical access control methods
    findAllByUserRole(
        userRoleType: ENUM_ROLE_TYPE,
        userRoleName: string,
        companyId?: string,
        currentUserlevel?: number,
        options?: IDatabaseFindAllOptions
    ): Promise<RoleDoc[]>;
    canManageRole(
        managerRoleType: ENUM_ROLE_TYPE,
        managerRoleName: string,
        managerCompanyId: string,
        targetRole: RoleDoc
    ): Promise<boolean>;
    hasPermission(
        permissions: Record<string, Record<string, boolean>>,
        module: string,
        action: string
    ): boolean;
    findOneWithSyncedPermissions(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<RoleDoc>;
}
