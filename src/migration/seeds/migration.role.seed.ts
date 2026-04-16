import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { RoleService } from '@modules/role/services/role.service';
import { RoleCreateDefaultRequestDto } from '@modules/role/dtos/request/role.create-default.request.dto';
import { ENUM_ROLE_TYPE, ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { COMPANY_DEFAULT_PERMISSIONS } from '@modules/role/constants/company.permissions';
import { AGENT_DEFAULT_PERMISSIONS } from '@modules/role/constants/agent.permissions';
import { LOCATION_ADMIN_DEFAULT_PERMISSIONS } from '@modules/role/constants/location-admin.permissions';
import { EMPLOYEE_DEFAULT_PERMISSIONS } from '@modules/role/constants/employee.permissions';

@Injectable()
export class MigrationRoleSeed {
    constructor(private readonly roleService: RoleService) { }

    @Command({
        command: 'seed:role',
        describe: 'seed roles',
    })
    async seeds(): Promise<void> {
        // Get default permissions template with all permissions set to false
        const defaultPermissions = this.roleService.getDefaultPermissions();

        // Create admin role with all permissions enabled except location and employee
        // (locations and employees are company-level, not platform-level)
        const adminPermissions = { ...defaultPermissions };
        Object.keys(adminPermissions).forEach(module => {
            // Skip location and employee modules for Super Admin
            if (module === 'location' || module === 'employee') {
                return;
            }
            Object.keys(adminPermissions[module]).forEach(permission => {
                adminPermissions[module][permission] = true;
            });
        });

        // Create company admin role with limited permissions
        const companyAdminPermissions = COMPANY_DEFAULT_PERMISSIONS; //{ ...defaultPermissions };
        // Give Company Admin basic permissions but not full admin access
        // companyAdminPermissions.user = {
        //     can_all: false,
        //     can_read: true,
        //     can_add: true,
        //     can_update: true,
        //     can_delete: false
        // };
        // companyAdminPermissions.role = {
        //     can_all: false,
        //     can_read: true,
        //     can_add: true,
        //     can_update: true,
        //     can_delete: false
        // };

        const AgentPermissions = { ...AGENT_DEFAULT_PERMISSIONS};
        const LocationAdminPermissions = { ...LOCATION_ADMIN_DEFAULT_PERMISSIONS };
        const EmployeePermissions = { ...EMPLOYEE_DEFAULT_PERMISSIONS };

        const data: RoleCreateDefaultRequestDto[] = [
            {
                name: ENUM_SYSTEM_ROLE.SUPER_ADMIN,
                type: ENUM_ROLE_TYPE.SYSTEM,
                isDefault: true,
                permissions: adminPermissions,
                manageable_roles: [
                    ENUM_SYSTEM_ROLE.COMPANY_ADMIN,
                    ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
                    ENUM_SYSTEM_ROLE.EMPLOYEE,
                    ENUM_SYSTEM_ROLE.AGENT
                ],
                editable_roles: [
                    ENUM_SYSTEM_ROLE.COMPANY_ADMIN,
                    ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
                    ENUM_SYSTEM_ROLE.EMPLOYEE,
                    ENUM_SYSTEM_ROLE.AGENT
                ],
                access_scope: 'system',
                category: 'admin', // Super Admin is system admin only
            },
            {
                name: ENUM_SYSTEM_ROLE.COMPANY_ADMIN,
                type: ENUM_ROLE_TYPE.SYSTEM,
                isDefault: true,
                permissions: companyAdminPermissions,
                manageable_roles: [
                    ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
                    ENUM_SYSTEM_ROLE.EMPLOYEE
                ],
                editable_roles: [
                    ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
                    ENUM_SYSTEM_ROLE.EMPLOYEE
                ],
                access_scope: 'company',
                category: 'company_default', // Default company role
            },
            {
                name: ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
                type: ENUM_ROLE_TYPE.SYSTEM,
                isDefault: true,
                permissions: LocationAdminPermissions,
                manageable_roles: [
                    ENUM_SYSTEM_ROLE.EMPLOYEE
                ],
                editable_roles: [
                    ENUM_SYSTEM_ROLE.EMPLOYEE
                ],
                access_scope: 'location',
                category: 'company_default', // Default company role
            },
            {
                name: ENUM_SYSTEM_ROLE.EMPLOYEE,
                type: ENUM_ROLE_TYPE.SYSTEM,
                isDefault: true,
                permissions: EmployeePermissions,
                manageable_roles: [],
                editable_roles: [],
                access_scope: 'self',
                category: 'company_default', // Default company role
            },
            {
                name: ENUM_SYSTEM_ROLE.AGENT,
                type: ENUM_ROLE_TYPE.SYSTEM,
                isDefault: true,
                permissions: AgentPermissions,
                manageable_roles: [],
                editable_roles: [],
                access_scope: 'self',
                category: 'admin', // Agent is system admin only
            },
        ];

        try {
            await this.roleService.createManyDefaultRole(data);
            console.log('✅ System roles seeded successfully');
        } catch (err: any) {
            console.log("❌ Role seeds error:", err);
            throw new Error(err);
        }

        return;
    }

    @Command({
        command: 'remove:role',
        describe: 'remove roles',
    })
    async remove(): Promise<void> {
        try {
            await this.roleService.deleteMany();
        } catch (err: any) {
            throw new Error(err);
        }

        return;
    }
}