export const MANAGER_DEFAULT_PERMISSIONS = {
    user: {
        can_all: false,
        can_read: true, // Can view users at their location
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    role: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    location: {
        can_all: false,
        can_read: true, // Can view their assigned location
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    employee: {
        can_all: false,
        can_read: true,
        can_add: true, // Can add employees
        can_create: true,
        can_update: true, // Can update employee details
        can_delete: false, // Cannot delete
    },
    payment: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    report: {
        can_all: false,
        can_read: true, // Can view reports for their team
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    tools: {
        can_all: false,
        can_read: true,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    assessment: {
        can_all: false,
        can_read: true,
        can_add: false,
        can_create: false,
        can_update: true,
        can_delete: false,
    },
    settings: {
        can_all: false,
        can_read: true,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
} as const;

export type ManagerPermissions = typeof MANAGER_DEFAULT_PERMISSIONS;
