export const AGENT_DEFAULT_PERMISSIONS = {
    company: {
        can_all: false,
        can_read: true,
        can_add: true,
        can_create: true,
        can_update: true,
        can_delete: false,
    },
    subscription: {
        can_all: false,
        can_read: true,
        can_add: false,
        can_update: false,
        can_delete: false,
    },
} as const;

export type AgentPermissions = typeof AGENT_DEFAULT_PERMISSIONS;
