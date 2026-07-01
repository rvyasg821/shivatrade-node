import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_ROLE_TYPE, ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { ENUM_USER_TYPE } from '@common/enums/user-type.enum';
import { IUnifiedAuthJwtAccessTokenPayload } from '@modules/auth/interfaces/auth.unified.interface';
export interface IPermissionMetadata {
    module: string;
    action: string;
}

export const PERMISSION_KEY = 'permission';

@Injectable()
export class PermissionGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private roleService: RoleService
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const permission = this.reflector.getAllAndOverride<IPermissionMetadata>(
            PERMISSION_KEY,
            [context.getHandler(), context.getClass()]
        );

        if (!permission) {
            return true; // No permission metadata, allow access
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user as IUnifiedAuthJwtAccessTokenPayload;

        if (!user || !user.role) {
            throw new ForbiddenException('User role not found');
        }

        // Handle different user types
        if (user.userType === ENUM_USER_TYPE.TENANT_USER) {
            return this.checkTenantUserPermission(user, permission);
        } else {
            return this.checkMasterUserPermission(user, permission);
        }
    }

    private async checkMasterUserPermission(
        user: IUnifiedAuthJwtAccessTokenPayload,
        permission: IPermissionMetadata
    ): Promise<boolean> {
        // Get user role details from master database
        const userRole = await this.roleService.findOneById(user.role);
        if (!userRole) {
            throw new ForbiddenException('Invalid user role');
        }

        if (userRole.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
            return true;
        }

        // Check if user has the required permission
        const hasPermission = this.roleService.hasPermission(
            userRole.permissions,
            permission.module,
            permission.action
        );

        if (!hasPermission) {
            throw new ForbiddenException(
                `Insufficient permissions: ${permission.module}.${permission.action}`
            );
        }

        return true;
    }

    private async checkTenantUserPermission(
        user: IUnifiedAuthJwtAccessTokenPayload,
        permission: IPermissionMetadata
    ): Promise<boolean> {
        // Multi-tenant was removed: former "tenant" users (Location Admin,
        // Employee, custom company roles) now live in the central database and
        // are permission-checked exactly like master users. Delegate to the
        // shared role-lookup + hasPermission logic instead of hard-blocking.
        return this.checkMasterUserPermission(user, permission);
    }
}