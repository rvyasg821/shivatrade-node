import { ConflictException, ForbiddenException } from '@nestjs/common';

/**
 * Exception thrown when user tries to manage role above their hierarchy level
 */
export class RoleHierarchyInsufficientLevelException extends ForbiddenException {
    constructor(
        currentLevel: number,
        requiredLevel: number,
        operation: string = 'manage'
    ) {
        super({
            statusCode: 403,
            message: `Insufficient role level to ${operation} this role`,
            error: 'ROLE_HIERARCHY_INSUFFICIENT_LEVEL',
            data: {
                currentLevel,
                requiredLevel,
                operation,
            },
        });
    }
}

/**
 * Exception thrown when user tries to manage user above their hierarchy level
 */
export class UserHierarchyInsufficientLevelException extends ForbiddenException {
    constructor(
        currentLevel: number,
        targetLevel: number,
        operation: string = 'manage'
    ) {
        super({
            statusCode: 403,
            message: `Insufficient role level to ${operation} this user`,
            error: 'USER_HIERARCHY_INSUFFICIENT_LEVEL',
            data: {
                currentLevel,
                targetLevel,
                operation,
            },
        });
    }
}

/**
 * Exception thrown when attempting to delete role with assigned users
 */
export class RoleDeletionHasUsersException extends ConflictException {
    constructor(roleName?: string, userCount?: number) {
        super({
            statusCode: 409,
            message: 'Cannot delete role as it is assigned to one or more users',
            error: 'ROLE_DELETION_HAS_USERS',
            data: {
                roleName,
                userCount,
                suggestion: 'Please reassign users to different roles before deleting this role',
            },
        });
    }
}

/**
 * Exception thrown when role level is invalid
 */
export class InvalidRoleLevelException extends ConflictException {
    constructor(level: number, reason: string) {
        super({
            statusCode: 409,
            message: `Invalid role level: ${level}. ${reason}`,
            error: 'INVALID_ROLE_LEVEL',
            data: {
                level,
                reason,
            },
        });
    }
}

/**
 * Exception thrown when tenant role hierarchy is violated
 */
export class TenantRoleHierarchyInsufficientLevelException extends ForbiddenException {
    constructor(
        currentLevel: number,
        requiredLevel: number,
        tenantId: string,
        operation: string = 'manage'
    ) {
        super({
            statusCode: 403,
            message: `Insufficient role level to ${operation} this tenant role`,
            error: 'TENANT_ROLE_HIERARCHY_INSUFFICIENT_LEVEL',
            data: {
                currentLevel,
                requiredLevel,
                tenantId,
                operation,
            },
        });
    }
}

/**
 * Exception thrown when tenant user hierarchy is violated
 */
export class TenantUserHierarchyInsufficientLevelException extends ForbiddenException {
    constructor(
        currentLevel: number,
        targetLevel: number,
        tenantId: string,
        operation: string = 'manage'
    ) {
        super({
            statusCode: 403,
            message: `Insufficient role level to ${operation} this tenant user`,
            error: 'TENANT_USER_HIERARCHY_INSUFFICIENT_LEVEL',
            data: {
                currentLevel,
                targetLevel,
                tenantId,
                operation,
            },
        });
    }
}