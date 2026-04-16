import {
    Body,
    ConflictException,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    UseGuards,
    Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
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
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import {
    ROLE_DEFAULT_AVAILABLE_SEARCH,
    ROLE_DEFAULT_IS_ACTIVE,
} from '@modules/role/constants/role.list.constant';
import { RoleCreateSharedRequestDto } from '@modules/role/dtos/request/role.create-shared.request.dto';
import { RoleUpdateRequestDto } from '@modules/role/dtos/request/role.update.request.dto';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
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
import { ENUM_ROLE_TYPE } from '@modules/role/enums/role.enum';

@ApiTags('modules.shared.role')
@Controller({
    version: '1',
    path: '/role',
})
export class RoleSharedController {
    constructor(
        private readonly paginationService: PaginationService,
        private readonly roleService: RoleService
    ) { }

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
        @PaginationQueryFilterInEnum(
            'type',
            ENUM_ROLE_TYPE.CUSTOM,
            [ENUM_ROLE_TYPE.CUSTOM]
        )
        type: Record<string, any>,
        @AuthJwtPayload('roleLevel') currentUserRoleLevel: number,
        @Req() request: Request,
        // @CurrentCompany() companyId: string,
    ): Promise<IResponsePaging<RoleListResponseDto>> {
        const user = (request as any).user;

        // Get user's role information for hierarchical access control
        const userRole = await this.roleService.findOneById(user.role);

        const find: Record<string, any> = {
            ..._search,
            ...isActive,
            ...type,
        };

        // Apply hierarchical filtering based on user's role
        const roles: RoleDoc[] = await this.roleService.findAllByUserRole(
            userRole.type,
            userRole.name,
            user.companyId,
            currentUserRoleLevel,
            {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            }
        );

        // Use filtered roles for total count calculation
        const filteredFind: Record<string, any> = { ...find };

        // Apply same filtering logic as in service for total count
        if (userRole.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            // Super Admin only sees custom roles created by them (companyId is null)
            filteredFind.companyId = null;
            filteredFind.type = ENUM_ROLE_TYPE.CUSTOM;
        } else if (userRole.name === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
            // Company Admin only sees custom roles for their company
            if (user.companyId) {
                filteredFind.type = ENUM_ROLE_TYPE.CUSTOM;
                filteredFind.companyId = user.companyId;
            }
        } else if (userRole.type === ENUM_ROLE_TYPE.CUSTOM && user.companyId) {
            filteredFind.type = ENUM_ROLE_TYPE.CUSTOM;
            filteredFind.companyId = user.companyId;
        }

        const total: number = await this.roleService.getTotal(filteredFind);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );
        const mapRoles: RoleListResponseDto[] = this.roleService.mapList(roles);

        return {
            _pagination: { total, totalPage },
            data: mapRoles,
        };
    }

    @Response('role.get')
    @Permission('role', 'can_read')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/get/:role')
    async get(
        @Param('role', RequestRequiredPipe, RoleParsePipe) role: RoleDoc,
        @Req() request: Request,
    ): Promise<IResponse<RoleGetResponseDto>> {
        const user = (request as any).user;

        // Check if user can access this role
        const userRole = await this.roleService.findOneById(user.role);
        const canManage = await this.roleService.canManageRole(
            userRole.type,
            userRole.name,
            user.companyId,
            role
        );

        if (!canManage) {
            throw new ConflictException('Insufficient permissions to view this role');
        }

        // Get role with synced permissions
        const syncedRole = await this.roleService.findOneWithSyncedPermissions(String(role._id));
        const mapRole: RoleGetResponseDto = this.roleService.mapGet(syncedRole);

        return { data: mapRole };
    }

    @Response('role.create')
    @Permission('role', 'can_add')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body()
        { name, description, permissions }: RoleCreateSharedRequestDto,
        @Req() request: Request,
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const user = (request as any).user;

        // Check if role name already exists
        const existingRole = await this.roleService.existByName(name);
        if (existingRole) {
            throw new ConflictException('Role name already exists');
        }

        // Force custom type and user's company ID for shared controller
        const actualCompanyId = user.companyId;
        const actualType = ENUM_ROLE_TYPE.CUSTOM;

        // if (!actualCompanyId) {
        //     throw new ConflictException('User must belong to a company to create roles');
        // }

        const create = await this.roleService.create({
            name,
            description,
            type: actualType,
            // companyId: actualCompanyId,
            permissions,
        });

        return {
            data: { _id: String(create._id) },
        };
    }

    @Response('role.update')
    @Permission('role', 'can_update')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/update/:role')
    async update(
        @Param('role', RequestRequiredPipe, RoleParsePipe) role: RoleDoc,
        @Body()
        { description, name, permissions }: RoleUpdateRequestDto,
        @Req() request: Request
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const user = (request as any).user;

        // Check if user can manage this role
        const userRole = await this.roleService.findOneById(user.role);
        const canManage = await this.roleService.canManageRole(
            userRole.type,
            userRole.name,
            user.companyId,
            role
        );

        if (!canManage) {
            throw new ConflictException('Insufficient permissions to update this role');
        }

        // Check if new name conflicts with existing role (if name is being changed)
        if (name !== role.name) {
            const existingRole = await this.roleService.findOneByName(name);
            if (existingRole && String(existingRole._id) !== String(role._id)) {
                throw new ConflictException('Role name already exists');
            }
        }

        await this.roleService.update(role, {
            description,
            name,
            permissions,
            type: role.type, // Keep existing type
            companyId: role.companyId // Keep existing companyId
        });

        return {
            data: { _id: String(role._id) },
        };
    }

    @Response('role.inactive')
    @Permission('role', 'can_update')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Patch('/update/:role/inactive')
    async inactive(
        @Param(
            'role',
            RequestRequiredPipe,
            RoleParsePipe,
            new RoleIsActivePipe([true])
        )
        role: RoleDoc,
        @Req() request: Request
    ): Promise<void> {
        const user = (request as any).user;

        // Check if user can manage this role
        const userRole = await this.roleService.findOneById(user.role);
        const canManage = await this.roleService.canManageRole(
            userRole.type,
            userRole.name,
            user.companyId,
            role
        );

        if (!canManage) {
            throw new ConflictException('Insufficient permissions to deactivate this role');
        }

        await this.roleService.inactive(role);

        return;
    }

    @Response('role.active')
    @Permission('role', 'can_update')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Patch('/update/:role/active')
    async active(
        @Param(
            'role',
            RequestRequiredPipe,
            RoleParsePipe,
            new RoleIsActivePipe([false])
        )
        role: RoleDoc,
        @Req() request: Request
    ): Promise<void> {
        const user = (request as any).user;

        // Check if user can manage this role
        const userRole = await this.roleService.findOneById(user.role);
        const canManage = await this.roleService.canManageRole(
            userRole.type,
            userRole.name,
            user.companyId,
            role
        );

        if (!canManage) {
            throw new ConflictException('Insufficient permissions to activate this role');
        }

        await this.roleService.active(role);

        return;
    }

    @Response('role.delete')
    @Permission('role', 'can_delete')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Delete('/delete/:role')
    async delete(
        @Param('role', RequestRequiredPipe, RoleParsePipe, RoleIsUsedPipe)
        role: RoleDoc,
        @Req() request: Request
    ): Promise<void> {
        const user = (request as any).user;

        // Check if user can manage this role
        const userRole = await this.roleService.findOneById(user.role);
        const canManage = await this.roleService.canManageRole(
            userRole.type,
            userRole.name,
            user.companyId,
            role
        );

        if (!canManage) {
            throw new ConflictException('Insufficient permissions to delete this role');
        }

        await this.roleService.delete(role);

        return;
    }
}