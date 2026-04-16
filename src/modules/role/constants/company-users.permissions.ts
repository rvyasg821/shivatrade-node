export const COMPANY_USER_DEFAULT_PERMISSIONS = {
    user: {
        can_all: false,
        can_read: true,
        can_add: false,
        can_update: false,
        can_delete: false,
    },
    role: {
        can_all: false,
        can_read: true,
        can_add: false,
        can_update: false,
        can_delete: false,
    },
    tools: {
        can_all: false,
        can_read: true,
        can_add: false,
        can_update: false,
        can_delete: false,
    },
    assessment: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_update: false,
        can_delete: false,
    },
} as const;

export type CompanyUserPermissions = typeof COMPANY_USER_DEFAULT_PERMISSIONS;
