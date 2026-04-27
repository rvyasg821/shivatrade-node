/**
 * Permission operations interface
 * Defines standard CRUD permissions for a module
 */
export interface IModulePermissions {
    can_all: boolean;
    can_read: boolean;
    can_add: boolean;
    can_create: boolean;
    can_update: boolean;
    can_delete: boolean;
    [key: string]: boolean; // Index signature for compatibility
}

/**
 * System-level module permissions
 * Used for portal admin roles
 */
export interface ISystemPermissions {
    user?: IModulePermissions;
    role?: IModulePermissions;
    company?: IModulePermissions;
    plans?: IModulePermissions;
    subscription?: IModulePermissions;
    payment?: IModulePermissions;
    tools?: IModulePermissions;
    location?: IModulePermissions;
    employee?: IModulePermissions;
    discount?: IModulePermissions;
    settings?: IModulePermissions;
    agent?: IModulePermissions;
    dashboard?: IModulePermissions;
    reports?: IModulePermissions;
    [key: string]: IModulePermissions | Record<string, boolean> | undefined;
}

/**
 * Company-level module permissions
 * Used for tenant/company admin roles
 */
export interface ICompanyPermissions {
    user?: IModulePermissions;
    role?: IModulePermissions;
    location?: IModulePermissions;
    employee?: IModulePermissions;
    payment?: IModulePermissions;
    report?: IModulePermissions;
    tools?: IModulePermissions;
    assessment?: IModulePermissions;
    settings?: IModulePermissions;
    categories?: IModulePermissions;
    products?: IModulePermissions;
    vendors?: IModulePermissions;
    customers?: IModulePermissions;
    currencies?: IModulePermissions;
    [key: string]: IModulePermissions | Record<string, boolean> | undefined;
}

/**
 * Generic permissions type that can be either system or company level
 * Also compatible with Record<string, Record<string, boolean>> for backward compatibility
 */
export type IRolePermissions = ISystemPermissions | ICompanyPermissions | Record<string, Record<string, boolean>>;

/**
 * Permission check result
 */
export interface IPermissionCheck {
    module: string;
    operation: keyof IModulePermissions;
    allowed: boolean;
}

/**
 * Permission module names (enum-like)
 */
export const PermissionModule = {
    // System modules
    USER: 'user',
    ROLE: 'role',
    COMPANY: 'company',
    PLANS: 'plans',
    SUBSCRIPTION: 'subscription',
    PAYMENT: 'payment',
    TOOLS: 'tools',
    LOCATION: 'location',
    EMPLOYEE: 'employee',
    DISCOUNT: 'discount',
    SETTINGS: 'settings',
    AGENT: 'agent',
    DASHBOARD: 'dashboard',
    REPORTS: 'reports',
    ASSESSMENT: 'assessment',
    CATEGORIES: 'categories',
    PRODUCTS: 'products',
    VENDORS: 'vendors',
    CUSTOMERS: 'customers',
    CURRENCIES: 'currencies',
} as const;

export type PermissionModuleName = typeof PermissionModule[keyof typeof PermissionModule];

/**
 * Permission operations (enum-like)
 */
export const PermissionOperation = {
    ALL: 'can_all',
    READ: 'can_read',
    ADD: 'can_add',
    CREATE: 'can_create',
    UPDATE: 'can_update',
    DELETE: 'can_delete',
} as const;

export type PermissionOperationName = typeof PermissionOperation[keyof typeof PermissionOperation];
