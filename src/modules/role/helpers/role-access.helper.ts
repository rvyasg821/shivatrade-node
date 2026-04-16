/**
 * Role Access Helper
 * Handles role queries for both portal-level and company-level roles
 * Multi-tenant removed - uses central database with company_id field
 */

import { Injectable, Logger } from '@nestjs/common';
import { RoleService } from '@modules/role/services/role.service';

@Injectable()
export class RoleAccessHelper {
    private readonly logger = new Logger(RoleAccessHelper.name);

    constructor(
        private readonly roleService: RoleService
    ) {}

    /**
     * Get all portal-level roles (available to all companies)
     * These are roles with companyId = null
     */
    async getPortalRoles(options?: any): Promise<any[]> {
        return this.roleService.findAll(
            { companyId: null },
            options
        );
    }

    /**
     * Get company-specific roles
     * These are roles created by the company admin
     */
    async getCompanyRoles(companyId: string, options?: any): Promise<any[]> {
        return this.roleService.findAll(
            { companyId: companyId },
            options
        );
    }

    /**
     * Get all roles available to a company
     * Includes both portal roles and company-specific roles
     */
    async getAvailableRoles(companyId: string, options?: any): Promise<any[]> {
        return this.roleService.findAll(
            {
                $or: [
                    { companyId: null },        // Portal roles
                    { companyId: companyId }    // Company roles
                ]
            },
            options
        );
    }

    /**
     * Check if a role belongs to a company or is a portal role
     */
    async isCompanyRole(roleId: string): Promise<boolean> {
        const role = await this.roleService.findOneById(roleId);
        return role && role.companyId !== null && role.companyId !== undefined;
    }

    /**
     * Check if a role is a portal-level role
     */
    async isPortalRole(roleId: string): Promise<boolean> {
        const role = await this.roleService.findOneById(roleId);
        return role && (role.companyId === null || role.companyId === undefined);
    }

    /**
     * Validate if a company can use a specific role
     * Portal roles can be used by anyone
     * Company roles can only be used by the owning company
     */
    async canCompanyUseRole(companyId: string, roleId: string): Promise<boolean> {
        const role = await this.roleService.findOneById(roleId);

        if (!role) {
            return false;
        }

        // Portal roles can be used by anyone
        if (role.companyId === null || role.companyId === undefined) {
            return true;
        }

        // Company roles can only be used by the owning company
        return role.companyId.toString() === companyId;
    }
}
