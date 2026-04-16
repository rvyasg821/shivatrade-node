import { ENUM_ROLE_TYPE, ENUM_SYSTEM_ROLE } from '../enums/role.enum';

/**
 * Default system-level roles
 * These roles are stored in the central database
 */
export const SYSTEM_ROLES = [
    {
        name: ENUM_SYSTEM_ROLE.SUPER_ADMIN,
        description: 'Platform super administrator with full system access',
        type: ENUM_ROLE_TYPE.SYSTEM,
        isDefault: true,
        isActive: true,
        permissions: {
            // Super admin has access to everything at platform level
            company: { can_read: true, can_add: true, can_create: true, can_update: true, can_delete: true },
            user: { can_read: true, can_add: true, can_create: true, can_update: true, can_delete: true },
            role: { can_read: true, can_add: true, can_create: true, can_update: true, can_delete: true },
            subscription: { can_read: true, can_add: true, can_create: true, can_update: true, can_delete: true },
            payment: { can_read: true, can_add: true, can_create: true, can_update: true, can_delete: true },
            settings: { can_read: true, can_add: true, can_create: true, can_update: true, can_delete: true },
            agent: { can_read: true, can_add: true, can_create: true, can_update: true, can_delete: true },
        },
        level: 1
    },
    {
        name: ENUM_SYSTEM_ROLE.COMPANY_ADMIN,
        description: 'Company owner/administrator created during company signup',
        type: ENUM_ROLE_TYPE.SYSTEM,
        isDefault: true,
        isActive: true,
        permissions: {
            // Company admin has access to their company data
            company: { can_read: true, can_create: false, can_update: true, can_delete: false },
            subscription: { can_read: true, can_create: false, can_update: true, can_delete: false },
            payment: { can_read: true, can_create: true, can_update: false, can_delete: false },
        },
        level: 2
    },
    {
        name: ENUM_SYSTEM_ROLE.AGENT,
        description: 'Sales agent who helps companies purchase subscriptions',
        type: ENUM_ROLE_TYPE.SYSTEM,
        isDefault: true,
        isActive: true,
        permissions: {
            // Agent can manage companies and subscriptions but not delete
            company: { can_read: true, can_add: true, can_create: true, can_update: true, can_delete: false },
            subscription: { can_read: true, can_add: true, can_create: true, can_update: true, can_delete: false },
            payment: { can_read: true, can_add: true, can_create: true, can_update: true, can_delete: false },
            report: { can_read: true, can_add: false, can_create: false, can_update: false, can_delete: false },
        },
        level: 3
    }
];

/**
 * Get system role by name
 */
export function getSystemRoleByName(name: ENUM_SYSTEM_ROLE) {
    return SYSTEM_ROLES.find(role => role.name === name);
}

/**
 * Get super admin role
 */
export function getSuperAdminRole() {
    return SYSTEM_ROLES.find(role => role.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN);
}

/**
 * Get company admin role
 */
export function getCompanyAdminRole() {
    return SYSTEM_ROLES.find(role => role.name === ENUM_SYSTEM_ROLE.COMPANY_ADMIN);
}

/**
 * Get agent role
 */
export function getAgentRole() {
    return SYSTEM_ROLES.find(role => role.name === ENUM_SYSTEM_ROLE.AGENT);
}
