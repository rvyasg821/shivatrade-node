import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    NotFoundException,
    Param,
    Patch,
    Post,
    Put,
    Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
    PaginationQuery,
    PaginationQueryFilterInBoolean,
    PaginationQueryFilterInEnum,
} from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import { PaginationService } from '@common/pagination/services/pagination.service';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import {
    Response,
    ResponsePaging,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';

import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import {
    ROLE_DEFAULT_AVAILABLE_SEARCH,
    ROLE_DEFAULT_IS_ACTIVE,
} from '@modules/role/constants/role.list.constant';
import {
    RoleAdminActiveDoc,
    RoleAdminCreateDoc,
    RoleAdminDeleteDoc,
    RoleAdminGetDoc,
    RoleAdminInactiveDoc,
    RoleAdminListDoc,
    RoleAdminUpdateDoc,
} from '@modules/role/docs/role.admin.doc';
import { RoleCreateRequestDto } from '@modules/role/dtos/request/role.create.request.dto';
import { RoleUpdateRequestDto } from '@modules/role/dtos/request/role.update.request.dto';
import { RoleGetResponseDto } from '@modules/role/dtos/response/role.get.response.dto';
import { RoleListResponseDto } from '@modules/role/dtos/response/role.list.response.dto';
import { RoleIsActivePipe } from '@modules/role/pipes/role.is-active.pipe';
import { RoleParsePipe } from '@modules/role/pipes/role.parse.pipe';
import { RoleDoc } from '@modules/role/repository/entities/role.entity';
import { RoleService } from '@modules/role/services/role.service';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import { UserProtected } from '@modules/user/decorators/user.decorator';
import { RoleIsUsedPipe } from '@modules/role/pipes/role.is-used.pipe';
import { Permission } from '@modules/role/decorators/permission.decorator';
import { PermissionGuard } from '@modules/role/guards/permission.guard';
import { UseGuards, Req } from '@nestjs/common';
import {
    ENUM_ROLE_TYPE,
    ENUM_SYSTEM_ROLE,
} from '@modules/role/enums/role.enum';
import { Request } from 'express';
import { RoleRepository } from '../repository/repositories/role.repository';
import { RoleAccessHelper } from '../helpers/role-access.helper';
import { CompanyService } from '@modules/company/services/company.service';
import { IAuthJwtAccessTokenPayload } from '@modules/auth/interfaces/auth.interface';
import { ENUM_USER_TYPE } from '@common/enums/user-type.enum';
import {
    RoleHierarchyInsufficientLevelException,
    RoleDeletionHasUsersException,
    TenantRoleHierarchyInsufficientLevelException
} from '@common/exceptions/hierarchy.exception';
@ApiTags('modules.admin.role')
@Controller({
    version: '1',
    path: '/role',
})
export class RoleAdminController {
    constructor(
        private readonly paginationService: PaginationService,
        private readonly roleService: RoleService,
        private readonly roleAccessHelper: RoleAccessHelper,
        private readonly roleRepository: RoleRepository,
        private readonly companyService: CompanyService,) { }

    @RoleAdminListDoc()
    @ResponsePaging('role.list')
    @Permission('role', 'can_read')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @PaginationQuery({ availableSearch: ROLE_DEFAULT_AVAILABLE_SEARCH })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @PaginationQueryFilterInBoolean('isActive', ROLE_DEFAULT_IS_ACTIVE)
        isActive: Record<string, any>,
        @PaginationQueryFilterInEnum('type', ENUM_ROLE_TYPE.SYSTEM, [
            ENUM_ROLE_TYPE.SYSTEM,
            ENUM_ROLE_TYPE.CUSTOM,
        ])
        type: Record<string, any>,
        @Req() request: Request,
        @AuthJwtPayload('roleLevel') roleLevel: number,
        @Query('purpose') purpose?: string,
    ): Promise<IResponsePaging<RoleListResponseDto>> {
        const user = (request as any).user;

        // Get user's role information for hierarchical access control
        const userRole = await this.roleService.findOneById(user.role);

        // Get user's role level from JWT payload for hierarchy filtering
        // const currentUserLevel = user.roleLevel || 1;
        const currentUserLevel = roleLevel;

        const find: Record<string, any> = {
            ..._search,
            ...isActive,
            ...type,
        };

        // Apply hierarchical filtering based on user's role level
        // const roles: RoleDoc[] = await this.roleService.getRolesByUserLevel(
        //     currentUserLevel,
        const roles: RoleDoc[] = await this.roleService.findAllByUserRole(
            userRole.type,
            userRole.name,
            user.companyId,
            currentUserLevel,
            {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            },
            purpose
        );

        // Use filtered roles for total count calculation with category-based filtering
        let filteredFind: Record<string, any> = { ...find, isActive: true };

        // Apply same category-based filtering logic as in service for total count
        if (userRole.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            if (purpose === 'manage') {
                filteredFind = {
                    ...find,
                    isActive: true,
                    name: { $ne: ENUM_SYSTEM_ROLE.SUPER_ADMIN },
                    $or: [
                        { isDefault: true },
                        { category: 'custom', companyId: null },
                    ],
                };
            } else {
                filteredFind = {
                    ...find,
                    isActive: true,
                    category: 'custom',
                    companyId: null,
                };
            }
        } else if (userRole.name === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
            if (purpose === 'manage') {
                // Roles management page: only custom roles
                filteredFind = {
                    ...find,
                    isActive: true,
                    category: 'custom',
                    companyId: user.companyId
                };
            } else {
                // User form dropdown: default + custom roles
                filteredFind = {
                    ...find,
                    isActive: true,
                    name: { $ne: ENUM_SYSTEM_ROLE.COMPANY_ADMIN },
                    $or: [
                        { category: 'company_default' },
                        { category: 'custom', companyId: user.companyId }
                    ]
                };
            }
        } else if (userRole.name === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            if (purpose === 'manage') {
                // Roles management page: company's custom roles only
                filteredFind = {
                    ...find,
                    isActive: true,
                    category: 'custom',
                    companyId: user.companyId
                };
            } else {
                // User form dropdown: Employee default role + company custom roles
                filteredFind = {
                    ...find,
                    isActive: true,
                    $or: [
                        { name: 'Employee', category: 'company_default' },
                        { category: 'custom', companyId: user.companyId }
                    ]
                };
            }
        } else if (userRole.type === ENUM_ROLE_TYPE.CUSTOM && user.companyId) {
            // Custom roles see their company's custom roles at lower levels
            filteredFind = {
                ...find,
                isActive: true,
                category: 'custom',
                companyId: user.companyId,
                level: { $gt: currentUserLevel }
            };
        } else {
            // Employees and other roles cannot see any roles
            filteredFind = { ...find, isActive: true, _id: null }; // Force 0 results
        }
        // filteredFind= {
        //     ...find,
        //     isActive: true,
        //     level: { $gte: currentUserLevel }
        // };

        const total: number = await this.roleService.getTotal(filteredFind);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        // Use enhanced mapping with company user data for admin users
        const mapRoles: RoleListResponseDto[] = this.roleService.mapList(roles);

        return {
            _pagination: { total, totalPage },
            data: mapRoles,
        };
    }

    @RoleAdminGetDoc()
    @Response('role.get')
    @Permission('role', 'can_read')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/get/:role')
    async get(
        @Param('role', RequestRequiredPipe, RoleParsePipe) role: RoleDoc,
        @Req() request: Request,
        @AuthJwtPayload<IAuthJwtAccessTokenPayload>('role') currentUserRoleId: string
    ): Promise<IResponse<RoleGetResponseDto>> {
        const user = (request as any).user;

        console.log("User Payload in Role Get Role By ID: ===>", currentUserRoleId);

        // Company Admin cannot view the Company Admin role
        const userRole = await this.roleService.findOneById(user.role);
        if (
            userRole.name === ENUM_SYSTEM_ROLE.COMPANY_ADMIN &&
            role.name === ENUM_SYSTEM_ROLE.COMPANY_ADMIN
        ) {
            throw new ForbiddenException('You do not have permission to view the Company Admin role');
        }

        // Check if user can access this role based on hierarchy
        const currentUserLevel = user.roleLevel || 1;
        const canManage = this.roleService.validateRoleHierarchy(currentUserLevel, role.level);

        if (!canManage) {
            throw new RoleHierarchyInsufficientLevelException(
                currentUserLevel,
                role.level,
                'view'
            );
        }

        // Get role with synced permissions
        // const syncedRole = await this.roleService.findOneWithSyncedPermissions(
        //     String(role._id)
        // );
        // const mapRole: RoleGetResponseDto = this.roleService.mapGet(syncedRole);

        const mapRole: RoleGetResponseDto = this.roleService.mapGet(role);
        // Get current user's role for permission filtering
        // const userRole = await this.roleService.findOneById(user.role);

        // Filter permissions for non-admin users based on their own permissions
        // Only send permissions where the current user has true access
        // if (userRole.name !== ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
        //     const filteredPermissions: Record<
        //     string,
        //     Record<string, boolean>
        //     > = {};
        //     const currentUserPermissions = userRole.permissions;
        //     console.log("Map Role in Role Get Role By ID: ===>", user?.role);

        //     for (const [module, permissions] of Object.entries(
        //         mapRole.permissions
        //     )) {
        //         // Check if current user has access to this module
        //         if (currentUserPermissions[module]) {
        //             const filteredModulePermissions: Record<string, boolean> =
        //                 {};

        //             for (const [permission, value] of Object.entries(
        //                 permissions
        //             )) {
        //                 // Only include permission if current user has it set to true
        //                 if (
        //                     currentUserPermissions[module][permission] === true
        //                 ) {
        //                     filteredModulePermissions[permission] = value;
        //                 }
        //             }

        //             // Only include the module if it has at least one permission the user can see
        //             if (Object.keys(filteredModulePermissions).length > 0) {
        //                 filteredPermissions[module] = filteredModulePermissions;
        //             }
        //         }
        //     }

        //     mapRole.permissions = filteredPermissions;
        // }

        // // Filter permissions for non-admin users based on their own permissions
        // const getPermissionMixedWithCurrentuser = await this.roleService.getPermissionMixedWithCurrentuser(currentUserRoleId, role.permissions);

        // mapRole.permissions = getPermissionMixedWithCurrentuser;

        return { data: mapRole };
    }

    @RoleAdminCreateDoc()
    @Response('role.create')
    @Permission('role', 'can_add')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body()
        { name, description, type, permissions }: RoleCreateRequestDto,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload<IAuthJwtAccessTokenPayload>('userType') userType: string,
        @Req() request: Request
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const user = (request as any).user;
        const currentUserLevel = user.roleLevel || 1;
        const userCompanyId = user.companyId;

        // Get the level that would be assigned to the new role
        const newRoleLevel = await this.roleService.getNextRoleLevel(name);

        // Validate hierarchy - user can only create roles at or above their level
        if (!this.roleService.validateRoleHierarchy(currentUserLevel, newRoleLevel)) {
            throw new RoleHierarchyInsufficientLevelException(
                currentUserLevel,
                newRoleLevel,
                'create'
            );
        }
        const companyDoc = await this.companyService.findOneByUserId(userId);

        console.log('\n🔍 ===== ROLE CREATION DEBUG =====');
        console.log('📝 Request: name=%s, type=%s', name, type);
        console.log('👤 User: id=%s, level=%d, companyId=%s', userId, currentUserLevel, userCompanyId);
        console.log('🏢 Company Lookup: found=%s', !!companyDoc);
        if (companyDoc) {
            console.log('   Company: id=%s, name=%s', companyDoc._id, companyDoc.company_name);
        }

        // Determine the actual companyId to use
        let actualCompanyId = companyDoc?._id;

        // For company admins (level > 1), use their company from database
        // Fallback to JWT token companyId if database lookup fails
        if (currentUserLevel > 1) {
            actualCompanyId = companyDoc?._id || userCompanyId;
            console.log('✅ Level > 1: actualCompanyId=%s', actualCompanyId);

            // Force custom type for non-admin users (level > 2)
            if (type === ENUM_ROLE_TYPE.SYSTEM && currentUserLevel > 2) {
                console.log('❌ ERROR: Cannot create system role with level > 2');
                throw new ConflictException(
                    'Insufficient permissions to create system roles'
                );
            }
        } else {
            console.log('⚠️  Level = 1: Skipping company admin block');
        }

        // System roles cannot have companyId
        if (type === ENUM_ROLE_TYPE.SYSTEM && actualCompanyId) {
            console.log('❌ ERROR: System roles cannot have companyId');
            throw new ConflictException('System roles cannot have company ID');
        }

        // For custom roles, companyId is required for company admins
        if (type === ENUM_ROLE_TYPE.CUSTOM && currentUserLevel > 1 && !actualCompanyId) {
            console.log('❌ ERROR: Custom roles require companyId for company admins');
            throw new ConflictException('Company ID is required for custom roles');
        }

        // Permission cap: a limited (non-admin) creator can only assign
        // permissions they personally hold. Super Admin / Company Admin are
        // exempt. New roles have no existing permissions, so every requested
        // `true` is a fresh grant and must be within the creator's own set.
        const callerRoleForPerms = await this.roleService.findOneById(user.role);
        const callerName = callerRoleForPerms?.name;
        const isPrivileged =
            callerName === ENUM_SYSTEM_ROLE.SUPER_ADMIN ||
            callerName === 'Super Admin' ||
            callerName === ENUM_SYSTEM_ROLE.COMPANY_ADMIN;

        if (!isPrivileged && permissions && typeof permissions === 'object') {
            const creatorPerms = callerRoleForPerms?.permissions || {};
            for (const moduleKey of Object.keys(permissions)) {
                const nextModule = permissions[moduleKey] || {};
                const creatorModule = creatorPerms[moduleKey];
                for (const permKey of Object.keys(nextModule)) {
                    if (nextModule[permKey] !== true) continue;

                    if (!creatorModule) {
                        throw new BadRequestException(
                            `You do not have permission to assign this module '${moduleKey}'`
                        );
                    }
                    if (permKey === 'can_all') {
                        const hasAll = ['can_read', 'can_add', 'can_update', 'can_delete']
                            .every(k => creatorModule[k] === true);
                        if (!hasAll && creatorModule.can_all !== true) {
                            throw new BadRequestException(
                                `You do not have sufficient permissions to assign 'can_all' on module '${moduleKey}'`
                            );
                        }
                        continue;
                    }
                    if (creatorModule[permKey] !== true && creatorModule.can_all !== true) {
                        throw new BadRequestException(
                            `You do not have permission to assign '${permKey}' on module '${moduleKey}'`
                        );
                    }
                }
            }
        }

        const companyIdToSave = actualCompanyId ? actualCompanyId.toString() : null;
        console.log('💾 Saving: companyId=%s, type=%s', companyIdToSave, type);

        // Name-uniqueness check:
        //  - Default role names are globally protected (no custom role anywhere can reuse them)
        //  - Custom role names must be unique within the same scope (same companyId, null = system)
        //  - Same name IS allowed across different scopes (system vs company, or company A vs company B)
        const nameConflict = await this.roleService.existByNameInScope(name, companyIdToSave);
        if (nameConflict) {
            throw new ConflictException('A role with this name already exists in this scope. Default role names are globally reserved and cannot be reused.');
        }

        const create = await this.roleService.create({
            name,
            description,
            type,
            companyId: companyIdToSave,
            permissions,
        });

        console.log('✅ Created: id=%s, name=%s, type=%s, companyId=%s, level=%d',
            create._id, create.name, create.type, create.companyId, create.level);
        console.log('===== ROLE CREATION DEBUG END =====\n');

        return {
            data: { _id: String(create._id) },
        };
    }

    @RoleAdminUpdateDoc()
    @Response('role.update')
    @Permission('role', 'can_update')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/update/:role')
    async update(
        @Param('role', RequestRequiredPipe) role: string,
        @Body()
        {
            description,
            name,
            permissions,
            type,
            companyId,
        }: RoleUpdateRequestDto,
        @AuthJwtPayload<IAuthJwtAccessTokenPayload>('role')
        currentUserRole: string,
        @AuthJwtPayload<IAuthJwtAccessTokenPayload>() userPayloadToken: any,
        @Req() request: Request
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const user = (request as any).user;

        // Check if user is Tenant User or Company Admin and handle tenant-specific role update
        // Multi-tenant removed - tenant role operations disabled
        // const userType: ENUM_USER_TYPE = userPayloadToken?.userType;
        // const tenantId: string = userPayloadToken?.tenantId;

        // if (
        //     userType &&
        //     (userType === ENUM_USER_TYPE.TENANT_USER ||
        //         userType === ENUM_USER_TYPE.COMPANY_ADMIN) &&
        //     tenantId
        // ) {
        //     // Tenant-specific role update code removed
        // }

        const roleDoc: RoleDoc = await this.roleService.findOneById(role);

        // Nobody can edit the Super Admin role itself
        const callerRole = await this.roleService.findOneById(user.role);
        if (roleDoc.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            throw new ForbiddenException('The Super Admin role cannot be modified.');
        }

        // Company Admin cannot edit the Company Admin role
        if (
            callerRole.name === ENUM_SYSTEM_ROLE.COMPANY_ADMIN &&
            roleDoc.name === ENUM_SYSTEM_ROLE.COMPANY_ADMIN
        ) {
            throw new ForbiddenException('You do not have permission to edit the Company Admin role');
        }

        // Non-Super Admin users cannot edit default roles (company_default category)
        if (
            callerRole.name !== ENUM_SYSTEM_ROLE.SUPER_ADMIN &&
            roleDoc.category === 'company_default'
        ) {
            throw new ForbiddenException('Default roles cannot be modified. Create a custom role instead.');
        }

        // Super Admin can only update permissions on default roles (not name/description/type/level)
        // Use direct SQL update to bypass TypeORM entity change detection for JSONB columns
        if (roleDoc.isDefault && callerRole.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            await this.roleService.updatePermissionsById(String(roleDoc._id), permissions);

            return {
                data: { _id: String(roleDoc._id) },
            };
        }

        // Original logic for non-tenant users
        // Check if user can manage this role based on hierarchy
        const currentUserLevel = user.roleLevel || 1;
        const canManage = this.roleService.validateRoleHierarchy(currentUserLevel, roleDoc.level);

        if (!canManage) {
            throw new RoleHierarchyInsufficientLevelException(
                currentUserLevel,
                roleDoc.level,
                'update'
            );
        }

        // Check if new name conflicts with an existing role (if name is being changed)
        // Uses scoped check: default names are globally reserved; custom names unique within scope
        if (name !== roleDoc.name) {
            const nameConflict = await this.roleService.existByNameInScope(
                name,
                roleDoc.companyId ?? null,
                String(roleDoc._id)
            );
            if (nameConflict) {
                throw new ConflictException('A role with this name already exists in this scope. Default role names are globally reserved and cannot be reused.');
            }
        }

        // Super Admin and Company Admin bypass permission-level validation
        const creatorRoleName = userPayloadToken?.roleName;
        if (
            creatorRoleName === ENUM_USER_TYPE.ADMIN ||
            creatorRoleName === 'Super Admin' ||
            creatorRoleName === 'Company Admin'
        ) {
            await this.roleService.update(roleDoc, {
                description,
                name,
                permissions,
                type,
                companyId,
            });

            return {
                data: { _id: String(roleDoc._id) },
            };
        }

        const CurrentUserPermissions =
            await this.roleService.findOneById(currentUserRole);

        // Validate only NEWLY granted (off→on) permissions, comparing the
        // incoming payload against the role's EXISTING saved permissions.
        // Unchanged / pre-existing permissions pass through untouched, so a
        // limited editor can neither wipe nor be blocked by powers an admin
        // granted above them — they're only stopped from adding a permission
        // they don't personally hold.
        const creatorPerms = CurrentUserPermissions.permissions || {};
        const existingPerms = roleDoc.permissions || {};

        for (const moduleKey of Object.keys(permissions)) {
            const nextModule = permissions[moduleKey] || {};
            const prevModule = existingPerms[moduleKey] || {};
            const creatorModule = creatorPerms[moduleKey];

            for (const permKey of Object.keys(nextModule)) {
                const nextOn = nextModule[permKey] === true;
                const prevOn = prevModule[permKey] === true;
                if (!nextOn || prevOn) continue; // only police off→on changes

                if (!creatorModule) {
                    throw new BadRequestException(
                        `You do not have permission to assign this module '${moduleKey}'`
                    );
                }

                if (permKey === 'can_all') {
                    const hasAll = ['can_read', 'can_add', 'can_update', 'can_delete']
                        .every(k => creatorModule[k] === true);
                    if (!hasAll && creatorModule.can_all !== true) {
                        throw new BadRequestException(
                            `You do not have sufficient permissions to assign 'can_all' on module '${moduleKey}'`
                        );
                    }
                    continue;
                }

                // A creator with can_all on a module may grant any single action.
                if (creatorModule[permKey] !== true && creatorModule.can_all !== true) {
                    throw new BadRequestException(
                        `You do not have permission to assign '${permKey}' on module '${moduleKey}'`
                    );
                }
            }
        }

        await this.roleService.update(roleDoc, {
            description,
            name,
            permissions,
            type,
            companyId,
        });

        return {
            data: { _id: String(roleDoc._id) },
        };
    }

    @RoleAdminInactiveDoc()
    @Response('role.inactive')
    @Permission('role', 'can_update')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Patch('/update/:role/inactive')
    async inactive(
        @Param('role', RequestRequiredPipe) role: string,
        @AuthJwtPayload<IAuthJwtAccessTokenPayload>() userPayloadToken: any,
        @Req() request: Request
    ): Promise<void> {
        const user = (request as any).user;

        // Multi-tenant removed - tenant role deactivation disabled
        // const userType: ENUM_USER_TYPE = userPayloadToken?.userType;
        // const tenantId: string = userPayloadToken?.tenantId;

        // if (
        //     userType &&
        //     (userType === ENUM_USER_TYPE.TENANT_USER ||
        //         userType === ENUM_USER_TYPE.COMPANY_ADMIN) &&
        //     tenantId
        // ) {
        //     // Tenant-specific role deactivation code removed
        // }

        // Original logic for non-tenant users
        const roleDoc: RoleDoc = await this.roleService.findOneById(role);
        if (!roleDoc) {
            throw new NotFoundException('Role not found');
        }

        // Check if role is currently active
        if (!roleDoc.isActive) {
            throw new BadRequestException('Role is already inactive');
        }

        // Check if user can manage this role
        const userRole = await this.roleService.findOneById(user.role);
        const canManage = await this.roleService.canManageRole(
            userRole.type,
            userRole.name,
            user.companyId,
            roleDoc
        );

        if (!canManage) {
            throw new ConflictException(
                'Insufficient permissions to deactivate this role'
            );
        }

        await this.roleService.inactive(roleDoc);

        return;
    }

    @RoleAdminActiveDoc()
    @Response('role.active')
    @Permission('role', 'can_update')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Patch('/update/:role/active')
    async active(
        @Param('role', RequestRequiredPipe) role: string,
        @AuthJwtPayload<IAuthJwtAccessTokenPayload>() userPayloadToken: any,
        @Req() request: Request
    ): Promise<void> {
        const user = (request as any).user;

        // Multi-tenant removed - tenant role activation disabled
        // const userType: ENUM_USER_TYPE = userPayloadToken?.userType;
        // const tenantId: string = userPayloadToken?.tenantId;

        // if (
        //     userType &&
        //     (userType === ENUM_USER_TYPE.TENANT_USER ||
        //         userType === ENUM_USER_TYPE.COMPANY_ADMIN) &&
        //     tenantId
        // ) {
        //     // Tenant-specific role activation code removed
        // }

        // Original logic for non-tenant users
        const roleDoc: RoleDoc = await this.roleService.findOneById(role);
        if (!roleDoc) {
            throw new NotFoundException('Role not found');
        }

        // Check if role is currently inactive
        if (roleDoc.isActive) {
            throw new BadRequestException('Role is already active');
        }

        // Check if user can manage this role
        const userRole = await this.roleService.findOneById(user.role);
        const canManage = await this.roleService.canManageRole(
            userRole.type,
            userRole.name,
            user.companyId,
            roleDoc
        );

        if (!canManage) {
            throw new ConflictException(
                'Insufficient permissions to activate this role'
            );
        }

        await this.roleService.active(roleDoc);

        return;
    }

    @RoleAdminDeleteDoc()
    @Response('role.delete')
    @Permission('role', 'can_delete')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Delete('/delete/:role')
    async delete(
        @Param('role', RequestRequiredPipe) role: string,
        @AuthJwtPayload<IAuthJwtAccessTokenPayload>() userPayloadToken: any,
        @Req() request: Request
    ): Promise<void> {
        const user = (request as any).user;

        // Multi-tenant removed - tenant role deletion disabled
        // const userType: ENUM_USER_TYPE = userPayloadToken?.userType;
        // const tenantId: string = userPayloadToken?.tenantId;

        // if (
        //     userType &&
        //     (userType === ENUM_USER_TYPE.TENANT_USER ||
        //         userType === ENUM_USER_TYPE.COMPANY_ADMIN) &&
        //     tenantId
        // ) {
        //     // Tenant-specific role deletion code removed
        // }

        // Original logic for non-tenant users
        const roleDoc: RoleDoc = await this.roleService.findOneById(role);
        if (!roleDoc) {
            throw new NotFoundException('Role not found');
        }

        // Check hierarchy for role deletion
        const currentUserLevel = user.roleLevel || 1;
        const canManage = this.roleService.validateRoleHierarchy(currentUserLevel, roleDoc.level);

        if (!canManage) {
            throw new RoleHierarchyInsufficientLevelException(
                currentUserLevel,
                roleDoc.level,
                'delete'
            );
        }

        // Check if role is assigned to any users
        const isRoleInUse = await this.roleService.checkRoleUsage(role);
        if (isRoleInUse) {
            throw new RoleDeletionHasUsersException(roleDoc.name);
        }

        await this.roleService.delete(roleDoc);

        return;
    }
}
