import { ENUM_ROLE_TYPE, ENUM_SYSTEM_ROLE } from '../enums/role.enum';
import { COMPANY_DEFAULT_PERMISSIONS } from '../constants/company.permissions';
import { LOCATION_ADMIN_DEFAULT_PERMISSIONS } from '../constants/location-admin.permissions';
import { EMPLOYEE_DEFAULT_PERMISSIONS } from '../constants/employee.permissions';
import { AGENT_DEFAULT_PERMISSIONS } from '../constants/agent.permissions';
import { VENDOR_DEFAULT_PERMISSIONS } from '../constants/vendor.permissions';
import { CUSTOMER_DEFAULT_PERMISSIONS } from '../constants/customer.permissions';
import { MODULES_PERMISSIONS } from '../constants/modules.permissions';

/**
 * Super Admin gets every module permission turned ON, except `location` and
 * `employee` which are company-level and not platform-level. Mirrors the logic
 * in `migration.role.seed.ts` so both seeders produce the same JSONB.
 */
function buildSuperAdminPermissions(): Record<string, Record<string, boolean>> {
    const perms: Record<string, Record<string, boolean>> = {};
    for (const [name, mod] of Object.entries(MODULES_PERMISSIONS.modules)) {
        if (name === 'location' || name === 'employee') continue;
        perms[name] = {};
        for (const op of mod.permissions) perms[name][op] = true;
    }
    return perms;
}

/**
 * Default system-level roles
 * These roles are stored in the central database. Each role's permissions
 * come from a single source-of-truth constant in `../constants/*.permissions.ts`
 * so that this file and `migration.role.seed.ts` stay in lock-step.
 */
export const SYSTEM_ROLES = [
    {
        name: ENUM_SYSTEM_ROLE.SUPER_ADMIN,
        description: 'Platform super administrator with full system access',
        type: ENUM_ROLE_TYPE.SYSTEM,
        isDefault: true,
        isActive: true,
        permissions: buildSuperAdminPermissions(),
        manageable_roles: [
            ENUM_SYSTEM_ROLE.COMPANY_ADMIN,
            ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
            ENUM_SYSTEM_ROLE.EMPLOYEE,
            ENUM_SYSTEM_ROLE.AGENT,
        ],
        editable_roles: [
            ENUM_SYSTEM_ROLE.COMPANY_ADMIN,
            ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
            ENUM_SYSTEM_ROLE.EMPLOYEE,
            ENUM_SYSTEM_ROLE.AGENT,
        ],
        access_scope: 'system',
        category: 'admin',
        level: 1,
    },
    {
        name: ENUM_SYSTEM_ROLE.COMPANY_ADMIN,
        description: 'Company owner/administrator created during company signup',
        type: ENUM_ROLE_TYPE.SYSTEM,
        isDefault: true,
        isActive: true,
        permissions: COMPANY_DEFAULT_PERMISSIONS,
        manageable_roles: [
            ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
            ENUM_SYSTEM_ROLE.EMPLOYEE,
        ],
        editable_roles: [
            ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
            ENUM_SYSTEM_ROLE.EMPLOYEE,
        ],
        access_scope: 'company',
        category: 'company_default',
        level: 2,
    },
    {
        name: ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
        description: 'Manages a specific location and its employees',
        type: ENUM_ROLE_TYPE.SYSTEM,
        isDefault: true,
        isActive: true,
        permissions: LOCATION_ADMIN_DEFAULT_PERMISSIONS,
        manageable_roles: [ENUM_SYSTEM_ROLE.EMPLOYEE],
        editable_roles: [ENUM_SYSTEM_ROLE.EMPLOYEE],
        access_scope: 'location',
        category: 'company_default',
        level: 2,
    },
    {
        name: ENUM_SYSTEM_ROLE.EMPLOYEE,
        description: 'Staff member at a location',
        type: ENUM_ROLE_TYPE.SYSTEM,
        isDefault: true,
        isActive: true,
        permissions: EMPLOYEE_DEFAULT_PERMISSIONS,
        manageable_roles: [],
        editable_roles: [],
        access_scope: 'self',
        category: 'company_default',
        level: 3,
    },
    {
        name: ENUM_SYSTEM_ROLE.AGENT,
        description: 'Sales agent who helps companies purchase subscriptions',
        type: ENUM_ROLE_TYPE.SYSTEM,
        isDefault: true,
        isActive: true,
        permissions: AGENT_DEFAULT_PERMISSIONS,
        manageable_roles: [],
        editable_roles: [],
        access_scope: 'self',
        category: 'admin',
        level: 3,
    },
    {
        name: ENUM_SYSTEM_ROLE.VENDOR,
        description: 'External supplier/vendor',
        type: ENUM_ROLE_TYPE.SYSTEM,
        isDefault: true,
        isActive: true,
        permissions: VENDOR_DEFAULT_PERMISSIONS,
        manageable_roles: [],
        editable_roles: [],
        access_scope: 'self',
        category: 'admin',
        level: 4,
    },
    {
        name: ENUM_SYSTEM_ROLE.CUSTOMER,
        description: 'External customer',
        type: ENUM_ROLE_TYPE.SYSTEM,
        isDefault: true,
        isActive: true,
        permissions: CUSTOMER_DEFAULT_PERMISSIONS,
        manageable_roles: [],
        editable_roles: [],
        access_scope: 'self',
        category: 'admin',
        level: 4,
    },
];

/**
 * Get system role by name
 */
export function getSystemRoleByName(name: ENUM_SYSTEM_ROLE) {
    return SYSTEM_ROLES.find((role) => role.name === name);
}

export function getSuperAdminRole() {
    return SYSTEM_ROLES.find((r) => r.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN);
}

export function getCompanyAdminRole() {
    return SYSTEM_ROLES.find((r) => r.name === ENUM_SYSTEM_ROLE.COMPANY_ADMIN);
}

export function getLocationAdminRole() {
    return SYSTEM_ROLES.find((r) => r.name === ENUM_SYSTEM_ROLE.LOCATION_ADMIN);
}

export function getEmployeeRole() {
    return SYSTEM_ROLES.find((r) => r.name === ENUM_SYSTEM_ROLE.EMPLOYEE);
}

export function getAgentRole() {
    return SYSTEM_ROLES.find((r) => r.name === ENUM_SYSTEM_ROLE.AGENT);
}

export function getVendorRole() {
    return SYSTEM_ROLES.find((r) => r.name === ENUM_SYSTEM_ROLE.VENDOR);
}

export function getCustomerRole() {
    return SYSTEM_ROLES.find((r) => r.name === ENUM_SYSTEM_ROLE.CUSTOMER);
}
