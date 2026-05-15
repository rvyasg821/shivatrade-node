import { DatabaseService } from '@common/database/services/database.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { DatabaseHelperQueryContain } from '@common/database/decorators/database.decorator';
import { UserService } from '@modules/user/services/user.service';
import {
    IDatabaseCreateManyOptions,
    IDatabaseCreateOptions,
    IDatabaseDeleteManyOptions,
    IDatabaseDeleteOptions,
    IDatabaseExistsOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';
import { RoleCreateRequestDto } from '@modules/role/dtos/request/role.create.request.dto';
import { RoleUpdateRequestDto } from '@modules/role/dtos/request/role.update.request.dto';
import { RoleGetResponseDto } from '@modules/role/dtos/response/role.get.response.dto';
import { RoleListResponseDto } from '@modules/role/dtos/response/role.list.response.dto';
import { RoleShortResponseDto } from '@modules/role/dtos/response/role.short.response.dto';
import { RoleCreateDefaultRequestDto } from '@modules/role/dtos/request/role.create-default.request.dto';
import { IRoleService } from '@modules/role/interfaces/role.service.interface';
import {
    RoleDoc,
    RoleEntity,
} from '@modules/role/repository/entities/role.entity';
import { RoleRepository } from '@modules/role/repository/repositories/role.repository';
import { ENUM_ROLE_TYPE, ENUM_SYSTEM_ROLE } from '../enums/role.enum';
import { MODULES_PERMISSIONS } from '../constants/modules.permissions';
import { SYSTEM_USER_DEFAULT_PERMISSIONS } from '../constants/system-users.permissions copy';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class RoleService implements IRoleService {
    constructor(
        readonly roleRepository: RoleRepository,
        readonly databaseService: DatabaseService,
        readonly userService: UserService
    ) { }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<RoleDoc[]> {
        return this.roleRepository.findAll(find, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.roleRepository.getTotal(find, options);
    }

    async findAllActive(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<RoleDoc[]> {
        return this.roleRepository.findAll(
            { ...find, isActive: true },
            options
        );
    }

    async findAllActiveDefaultRoles(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<RoleDoc[]> {
        return this.roleRepository.findAll(
            { ...find, isActive: true, isDefault: true },
            options
        );
    }

    async getTotalActive(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.roleRepository.getTotal(
            { ...find, isActive: true },
            options
        );
    }

    async findAllActiveByType(
        type: ENUM_ROLE_TYPE,
        options?: IDatabaseFindAllOptions
    ): Promise<RoleDoc[]> {
        return this.roleRepository.findAll({ type, isActive: true }, options);
    }

    async findAllByTypes(
        types: string[],
        options?: IDatabaseFindAllOptions
    ): Promise<RoleDoc[]> {
        return this.roleRepository.findAll(
            this.databaseService.filterIn('type', types),
            options
        );
    }

    async findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<RoleDoc> {
        return this.roleRepository.findOneById(_id, options);
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<RoleDoc> {
        return this.roleRepository.findOne(find, options);
    }

    async findOneByName(
        name: string,
        options?: IDatabaseFindOneOptions
    ): Promise<RoleDoc> {
        return this.roleRepository.findOne(
            { name },
            options
        );
    }

    async findOneActiveById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<RoleDoc> {
        return this.roleRepository.findOne({ _id, isActive: true }, options);
    }

    async existByName(
        name: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean> {
        return this.roleRepository.exists(
            DatabaseHelperQueryContain('name', name, { fullWord: true }),
            options
        );
    }

    /**
     * Scoped name-uniqueness check for custom role creation/update.
     *
     * Rules:
     *  1. A custom role can NEVER use the name of a default role (isDefault=true) — globally protected.
     *  2. Within the same scope (companyId, where null = system level), names must be unique.
     *  3. The same name CAN exist in different scopes (e.g. system + company A + company B).
     *
     * @param name        Role name to check
     * @param companyId   Scope: null for system-level, a company UUID for company-level
     * @param excludeId   Role _id to exclude (used on updates to skip self-match)
     * @returns true if the name is already taken in this scope (conflict)
     */
    async existByNameInScope(
        name: string,
        companyId: string | null,
        excludeId?: string
    ): Promise<boolean> {
        // 1. Block if it matches a default role name (globally protected)
        const defaultRoleFind: Record<string, any> = { name, isDefault: true };
        if (excludeId) defaultRoleFind['_id'] = { $ne: excludeId };
        const defaultConflict = await this.roleRepository.findOne(defaultRoleFind);
        if (defaultConflict) return true;

        // 2. Block if another custom role with same name exists in the same scope
        const scopeFind: Record<string, any> = { name, isDefault: false, companyId };
        if (excludeId) scopeFind['_id'] = { $ne: excludeId };
        const scopeConflict = await this.roleRepository.findOne(scopeFind);
        return !!scopeConflict;
    }

    /**
     * @deprecated Use existByNameInScope instead.
     * Check if a role with the given name exists within a specific company.
     */
    async existByNameForCompany(
        name: string,
        companyId: string,
        excludeId?: string
    ): Promise<boolean> {
        return this.existByNameInScope(name, companyId, excludeId);
    }

    async isExistsByRoleName(name: string): Promise<RoleDoc> {
        return this.roleRepository.isExistByName(name);
    }

    async create(
        { name, description, type, companyId, permissions }: RoleCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<RoleDoc> {
        console.log('\n🔵 RoleService.create() START');
        console.log('  Input companyId:', companyId, 'type:', typeof companyId);

        const create: RoleEntity = new RoleEntity();
        create.name = name;
        create.description = description;
        create.type = type;
        // IMPORTANT: Always set companyId, even if null, to ensure field is stored
        create.companyId = companyId !== undefined ? companyId : null;
        create.permissions = permissions;
        create.isDefault = false;
        create.isActive = true;

        console.log('  Entity companyId before save:', create.companyId, 'type:', typeof create.companyId);

        // Set appropriate level based on role name and type
        create.level = await this.getNextRoleLevel(name);

        console.log('  Creating role with level:', create.level);
        const created = await this.roleRepository.create<RoleEntity>(create, options);
        console.log('  Created role _id:', created._id);
        console.log('  Created role companyId:', created.companyId);
        console.log('🔵 RoleService.create() END\n');

        return created;
    }

    async update(
        repository: RoleDoc,
        { permissions, name, type, description, companyId }: RoleUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<RoleDoc> {
        repository.name = name;
        repository.description = description;
        repository.type = type;
        // CRITICAL FIX: Only update companyId if explicitly provided in the request
        // Otherwise, preserve the existing value to prevent field removal
        if (companyId !== undefined) {
            repository.companyId = companyId;
        }
        if (permissions)
            repository.permissions = permissions; //this.syncPermissions(permissions);

        return this.roleRepository.save(repository, options);
    }

    // Direct permissions update — bypasses TypeORM entity change detection for JSONB
    async updatePermissionsById(
        roleId: string,
        permissions: Record<string, Record<string, boolean>>
    ): Promise<void> {
        await this.roleRepository.updatePermissions(roleId, permissions);
    }

    async findByIdAndUpdate(
        roleId: string,
        permissions: Record<string, Record<string, boolean>>,
        options?: IDatabaseSaveOptions
    ): Promise<RoleDoc> {
        console.log('\n⚠️  findByIdAndUpdate called for roleId:', roleId);
        const repository: RoleDoc = await this.roleRepository.findOneById(roleId);
        console.log('   Fetched role - name:', repository.name, 'companyId:', repository.companyId, 'hasOwnProperty:', repository.hasOwnProperty('companyId'));

        // if (permissions)
        repository.permissions = permissions; //this.syncPermissions(permissions);

        console.log('   Saving role with permissions update...');
        const result = await this.roleRepository.save(repository, options);
        console.log('   Saved role - companyId:', result.companyId, 'hasOwnProperty:', result.hasOwnProperty('companyId'), '\n');

        return result;
    }

    async saveEntity(
        repository: RoleDoc,
        options?: IDatabaseSaveOptions
    ): Promise<RoleDoc> {
        return this.roleRepository.save(repository, options);
    }

    async updateRaw(
        filter: Record<string, any>,
        update: Record<string, any>
    ): Promise<any> {
        return this.roleRepository.updateRaw(filter, update);
    }

    async active(
        repository: RoleDoc,
        options?: IDatabaseSaveOptions
    ): Promise<RoleDoc> {
        repository.isActive = true;

        return this.roleRepository.save(repository, options);
    }

    async inactive(
        repository: RoleDoc,
        options?: IDatabaseSaveOptions
    ): Promise<RoleDoc> {
        repository.isActive = false;

        return this.roleRepository.save(repository, options);
    }

    async delete(
        repository: RoleDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<boolean> {
        await this.roleRepository.delete(
            {
                _id: repository._id,
            },
            options
        );

        return true;
    }

    async deleteMany(
        find?: Record<string, any>,
        options?: IDatabaseDeleteManyOptions
    ): Promise<boolean> {
        await this.roleRepository.deleteMany(find, options);

        return true;
    }

    async createMany(
        data: RoleCreateRequestDto[],
        options?: IDatabaseCreateManyOptions
    ): Promise<boolean> {
        const create: RoleEntity[] = data.map(({ type, name, permissions, companyId }) => {
            const entity: RoleEntity = new RoleEntity();
            entity.name = name;
            entity.type = type;
            entity.companyId = companyId;
            entity.isDefault = false;
            entity.isActive = true;
            entity.permissions = permissions || this.getDefaultPermissions();

            return entity;
        }) as RoleEntity[];

        await this.roleRepository.createMany<RoleEntity>(create, options);

        return true;
    }

    async createManyDefaultRole(
        data: RoleCreateDefaultRequestDto[],
        options?: IDatabaseCreateManyOptions
    ): Promise<boolean> {
        const entitiesToCreate: RoleEntity[] = [];

        for (const { type, name, permissions, isDefault, category, manageable_roles, editable_roles, access_scope } of data) {
            // Check if role with same name already exists
            const existingRole = await this.findOneByName(name);

            if (existingRole) {
                // Upsert: update existing role's permissions and fields
                existingRole.permissions = permissions && Object.keys(permissions).length > 0 ? permissions : this.getDefaultPermissions();
                existingRole.category = category;
                existingRole.manageable_roles = manageable_roles || [];
                existingRole.editable_roles = editable_roles || [];
                existingRole.access_scope = access_scope;
                existingRole.type = type;
                existingRole.isDefault = isDefault ?? existingRole.isDefault;

                await this.roleRepository.save(existingRole);
                console.log(`   ✅ Updated existing role: ${name}`);
                continue;
            }

            // Create new role
            const entity = new RoleEntity();
            entity.name = name;
            entity.type = type;
            entity.isDefault = isDefault ?? false;
            entity.isActive = true;
            entity.permissions = permissions && Object.keys(permissions).length > 0 ? permissions : this.getDefaultPermissions();
            entity.category = category;
            entity.manageable_roles = manageable_roles || [];
            entity.editable_roles = editable_roles || [];
            entity.access_scope = access_scope;

            entity.level = await this.getNextRoleLevel(name);

            entitiesToCreate.push(entity);
            console.log(`   🆕 Creating new role: ${name}`);
        }

        if (entitiesToCreate.length > 0) {
            await this.roleRepository.createMany<RoleEntity>(entitiesToCreate, options);
        }

        return true;
    }

    // Permission management methods
    getDefaultPermissions(): Record<string, Record<string, boolean>> {
        const permissions: Record<string, Record<string, boolean>> = {};

        Object.keys(MODULES_PERMISSIONS.modules).forEach(moduleKey => {
            permissions[moduleKey] = { ...MODULES_PERMISSIONS.modules[moduleKey].default };
        });

        return permissions;
    }

    syncPermissions(currentPermissions: Record<string, Record<string, boolean>>): Record<string, Record<string, boolean>> {
        const syncedPermissions: Record<string, Record<string, boolean>> = {};

        // Add all modules from master template
        Object.keys(MODULES_PERMISSIONS.modules).forEach(moduleKey => {
            const moduleTemplate = MODULES_PERMISSIONS.modules[moduleKey];
            syncedPermissions[moduleKey] = {};

            // Add all permissions for this module
            moduleTemplate.permissions.forEach(permission => {
                // Use existing value if available, otherwise default to false
                syncedPermissions[moduleKey][permission] =
                    currentPermissions?.[moduleKey]?.[permission] ?? false;
            });
        });

        return syncedPermissions;
    }

    async syncAllRolePermissions(): Promise<boolean> {
        const roles = await this.findAll();

        for (const role of roles) {
            role.permissions = this.syncPermissions(role.permissions);
            await this.roleRepository.save(role);
        }

        return true;
    }

    // Hierarchical access control methods
    // purpose: 'assign' (default) = include default roles for user form dropdown
    //          'manage' = exclude default roles (for Roles management page)
    async findAllByUserRole(
        userRoleType: ENUM_ROLE_TYPE,
        userRoleName: string,
        companyId?: string,
        currentUserlevel?: number,
        options?: IDatabaseFindAllOptions,
        purpose?: string
    ): Promise<RoleDoc[]> {
        const filters: Record<string, any> = { isActive: true };

        // Super Admin:
        //   'manage' purpose (Roles page) → default roles + custom system roles
        //   otherwise (user form dropdown) → only custom system roles
        if (userRoleName === ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            let adminOptions = options?.join ? { ...options, join: true } : options;
            let adminFilters: Record<string, any>;
            if (purpose === 'manage') {
                adminFilters = {
                    ...filters,
                    name: { $nin: [ENUM_SYSTEM_ROLE.SUPER_ADMIN, ENUM_SYSTEM_ROLE.VENDOR, ENUM_SYSTEM_ROLE.CUSTOMER] }, // hide own role + Vendor/Customer (internal-only)
                    $or: [
                        { isDefault: true },
                        { category: 'custom', companyId: null },
                    ],
                };
            } else {
                adminFilters = {
                    ...filters,
                    category: 'custom',
                    companyId: null,
                };
            }
            const results = await this.roleRepository.findAll(adminFilters, adminOptions);
            return results;
        }

        // Company Admin can see default company roles and their company's custom roles
        if (userRoleName === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
            if (!companyId) {
                // If no companyId, return empty (shouldn't happen for valid Company Admin)
                return [];
            }

            let query: Record<string, any>;

            if (purpose === 'manage') {
                // Roles management page: only show custom roles (hide default roles)
                query = {
                    ...filters,
                    category: 'custom',
                    companyId: companyId
                };
            } else {
                // User form dropdown (assign): show default + custom roles
                query = {
                    ...filters,
                    name: { $ne: ENUM_SYSTEM_ROLE.COMPANY_ADMIN }, // Company Admin cannot see its own role
                    $or: [
                        { category: 'company_default' },  // Default company roles (Location Admin, Employee)
                        {
                            category: 'custom',            // Custom roles for their company
                            companyId: companyId
                        }
                    ]
                };
            }

            console.log('🔍 Company Admin role filter:', JSON.stringify(query));
            const results = await this.roleRepository.findAll(query, options);
            console.log('📋 Company Admin sees', results.length, 'roles');
            return results;
        }

        // Location Admin can see Employee role + company custom roles
        if (userRoleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            if (!companyId) {
                return [];
            }

            let query: Record<string, any>;

            if (purpose === 'manage') {
                // Roles management page: show company's custom roles only
                query = {
                    ...filters,
                    category: 'custom',
                    companyId: companyId
                };
            } else {
                // User form dropdown (assign): Employee default role + company custom roles
                query = {
                    ...filters,
                    $or: [
                        { name: 'Employee', category: 'company_default' },
                        { category: 'custom', companyId: companyId }
                    ]
                };
            }

            console.log('🔍 Location Admin role filter:', JSON.stringify(query));
            const results = await this.roleRepository.findAll(query, options);
            console.log('📋 Location Admin sees', results.length, 'role(s)');
            return results;
        }

        // For other system roles (Employee), they typically cannot manage any roles
        if (userRoleType === ENUM_ROLE_TYPE.SYSTEM && userRoleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            // Employees and other system roles don't manage roles by default
            return [];
        }

        // Custom roles can see custom roles at their level or below within their company
        if (userRoleType === ENUM_ROLE_TYPE.CUSTOM) {
            if (!companyId) {
                return [];
            }

            const query = {
                ...filters,
                category: 'custom',
                companyId,
                level: { $gt: currentUserlevel }
            };

            return this.roleRepository.findAll(query, options);
        }

        return [];
    }

    async canManageRole(
        managerRoleType: ENUM_ROLE_TYPE,
        managerRoleName: string,
        managerCompanyId: string,
        targetRole: RoleDoc
    ): Promise<boolean> {
        // Admin can manage all roles
        if (managerRoleName === ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            return true;
        }

        // Company Admin can manage custom roles in their company, but not system roles
        if (managerRoleName === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
            return targetRole.type === ENUM_ROLE_TYPE.CUSTOM &&
                targetRole.companyId === managerCompanyId;
        }

        // Custom roles cannot manage other roles
        return false;
    }

    hasPermission(
        permissions: Record<string, Record<string, boolean>>,
        module: string,
        action: string
    ): boolean {
        const modulePermissions = permissions[module];
        if (!modulePermissions) return false;

        // Check if can_all is enabled for this module (overrides all other permissions)
        if (modulePermissions.can_all === true) return true;

        // Check specific permission
        return modulePermissions[action] === true;
    }

    async findOneWithSyncedPermissions(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<RoleDoc> {
        const role = await this.roleRepository.findOneById(_id, options);
        if (role) {
            role.permissions = this.syncPermissions(role.permissions);
        }
        return role;
    }

    mapList(roles: RoleDoc[] | RoleEntity[]): RoleListResponseDto[] {
        return plainToInstance(
            RoleListResponseDto,
            roles.map((e: RoleDoc | RoleEntity) =>
                (e as any).toObject ? (e as any).toObject() : e
            )
        );
    }

    mapGet(role: RoleDoc | RoleEntity): RoleGetResponseDto {
        return plainToInstance(
            RoleGetResponseDto,
            (role as any).toObject ? (role as any).toObject() : role
        );
    }

    mapShort(roles: RoleDoc[] | RoleEntity[]): RoleShortResponseDto[] {
        return plainToInstance(
            RoleShortResponseDto,
            roles.map((e: RoleDoc | RoleEntity) =>
                (e as any).toObject ? (e as any).toObject() : e
            )
        );
    }

    async mapListWithCompanyUsers(roles: RoleDoc[] | RoleEntity[]): Promise<RoleListResponseDto[]> {
        const mappedRoles = this.mapList(roles);

        // Get all users with their roles to count company users
        const usersWithRoles = await this.userService.findAllActiveWithRoleAndCountry();

        // Create a map of companyId to user count and user list
        const companyUserData: Record<string, { count: number; users: any[] }> = {};
        usersWithRoles.forEach(user => {
            if (user.companyId) {
                if (!companyUserData[user.companyId]) {
                    companyUserData[user.companyId] = { count: 0, users: [] };
                }
                companyUserData[user.companyId].count += 1;
                companyUserData[user.companyId].users.push({
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    companyId: user.companyId
                });
            }
        });

        // Add company user data to each role
        const rolesWithCompanyUsers = mappedRoles.map(role => {
            if (role.companyId && companyUserData[role.companyId]) {
                return {
                    ...role,
                    companyUsersCount: companyUserData[role.companyId].count,
                    companyUsers: companyUserData[role.companyId].users
                };
            }
            return {
                ...role,
                companyUsersCount: 0,
                companyUsers: []
            };
        });

        return rolesWithCompanyUsers;
    }
    
    async getPermissionMixedWithCurrentuser(
        roleId: string,
        currenPermission: Record<string, any>
    ): Promise<Record<string, Record<string, any>>> {
        const role =  await this.roleRepository.findOneById(roleId);
        if (!role) {
            throw new NotFoundException('Role not found');
        }
        if(role.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN){
            const newPermissions = JSON.parse(JSON.stringify(SYSTEM_USER_DEFAULT_PERMISSIONS));
            for (const moduleKey in newPermissions) {
                if (newPermissions.hasOwnProperty(moduleKey)) {
                    newPermissions[moduleKey].can_all = false;
                    newPermissions[moduleKey].can_read = false;
                    newPermissions[moduleKey].can_add = false;
                    newPermissions[moduleKey].can_update = false;
                    newPermissions[moduleKey].can_delete = false;
                }
            }
            return {...newPermissions, ...currenPermission};
        }
        const permissions = role.permissions;
        const newPermissions = JSON.parse(JSON.stringify(permissions));
        for (const moduleKey in newPermissions) {
            if (newPermissions.hasOwnProperty(moduleKey)) {
                newPermissions[moduleKey].can_all = false;
                newPermissions[moduleKey].can_read = false;
                newPermissions[moduleKey].can_add = false;
                newPermissions[moduleKey].can_update = false;
                newPermissions[moduleKey].can_delete = false;
            }
        }
        return {...newPermissions, ...currenPermission};
    }

    // Role Hierarchy Validation Methods

    /**
     * Validates if current user can manage target role based on hierarchy
     * Returns true if currentUserLevel <= targetRoleLevel (lower number = higher authority)
     */
    validateRoleHierarchy(currentUserLevel: number, targetRoleLevel: number): boolean {
        return currentUserLevel <= targetRoleLevel;
    }

    /**
     * Returns roles that user can manage (level >= userLevel)
     */
    async getRolesByUserLevel(
        userLevel: number,
        options?: IDatabaseFindAllOptions
    ): Promise<RoleDoc[]> {
        return this.roleRepository.findAll(
            { 
                isActive: true,
                level: { $gte: userLevel }
            },
            options
        );
    }

    /**
     * Checks if role is assigned to any users before deletion
     */
    async checkRoleUsage(roleId: string): Promise<boolean> {
        const usersWithRole = await this.userService.findAll({ role: roleId });
        return usersWithRole.length > 0;
    }

    /**
     * Gets the next available level for new role creation
     * SuperAdmin = 1, CompanyAdmin = 2, others start from 3
     */
    async getNextRoleLevel(roleName?: string): Promise<number> {
        // Fixed levels for system roles
        if (roleName === ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            return 1;
        }
        if (roleName === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
            return 2;
        }
        if (roleName === ENUM_SYSTEM_ROLE.AGENT) {
            return 2;
        }

        // For custom roles, find the highest level and add 1
        const highestLevelRole = await this.roleRepository.findAll(
            {},
            {
                order: { level: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC },
                paging: { limit: 1, offset: 0 },
            }
        );

        if (highestLevelRole.length === 0) {
            return 3; // Start from 3 if no roles exist
        }

        const maxLevel = highestLevelRole[0].level;
        return Math.max(maxLevel + 1, 3); // Ensure minimum level is 3 for custom roles
    }

    /**
     * Updates role level and cascades to all users with that role
     */
    async updateRoleLevel(
        roleId: string, 
        newLevel: number,
        options?: IDatabaseSaveOptions
    ): Promise<void> {
        // Update the role level
        const role = await this.findOneById(roleId);
        if (!role) {
            throw new NotFoundException('Role not found');
        }

        role.level = newLevel;
        await this.roleRepository.save(role, options);

        // Update all users with this role to have the new roleLevel
        await this.userService.updateManyByRole(roleId, { roleLevel: newLevel });
    }

    /**
     * Validates role level during creation and update
     */
    validateRoleLevel(level: number, roleName?: string): boolean {
        // Level must be a positive integer
        if (!Number.isInteger(level) || level < 1) {
            return false;
        }

        // System roles have fixed levels
        if (roleName === ENUM_SYSTEM_ROLE.SUPER_ADMIN && level !== 1) {
            return false;
        }
        if (roleName === ENUM_SYSTEM_ROLE.COMPANY_ADMIN && level !== 2) {
            return false;
        }

        // Custom roles must be level 3 or higher
        if (roleName && 
            roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN && 
            roleName !== ENUM_SYSTEM_ROLE.COMPANY_ADMIN && 
            level < 3) {
            return false;
        }

        return true;
    }
}
