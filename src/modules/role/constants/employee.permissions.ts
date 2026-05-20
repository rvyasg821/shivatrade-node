export const EMPLOYEE_DEFAULT_PERMISSIONS = {
    // * Master Group (no access - employees don't manage other users) *
    user: {
        can_all: false,
        can_read: false,
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
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    employee: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },

    // * Root Group (no access) *
    tools: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    company: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    subscription: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    plans: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    payments: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    discount: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },

    // * Company-level modules (minimal) *
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
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    assessment: {
        can_all: false,
        can_read: true, // Can view and take own assessments
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    settings: {
        can_all: false,
        can_read: true, // Can view own settings
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },

    // * HRM Modules (own data only - scoped by backend to self) *
    holiday_calendar: {
        can_all: false,
        can_read: true, // Can view company/location holidays
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    document: {
        can_all: false,
        can_read: true,  // Can view own documents
        can_add: true,   // Can upload own documents
        can_create: true,
        can_update: false,
        can_delete: false,
    },
    contract: {
        can_all: false,
        can_read: true,   // Can view own contracts
        can_add: false,
        can_create: false,
        can_update: true,  // Can sign (update) own contracts
        can_delete: false,
    },
    leave: {
        can_all: false,
        can_read: true,   // Can view own leave requests and balance
        can_add: true,    // Can submit leave requests
        can_create: true,
        can_update: true,  // Can cancel own pending requests
        can_delete: false,
    },
    attendance: {
        can_all: false,
        can_read: true,   // Can view own attendance records
        can_add: true,    // Can clock in/out
        can_create: true,
        can_update: false,
        can_delete: false,
    },
    shift: {
        can_all: false,
        can_read: true,   // Can view own shifts/rota
        can_add: true,    // Can create swap requests
        can_create: true,
        can_update: true,  // Can accept/decline swap requests
        can_delete: false,
    },
    compliance: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },

    // * Catalogue Modules (no access) *
    categories: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    products: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    vendors: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    customers: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    leads: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    rebates: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    expenses: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    currencies: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    "price-list": {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },

    // * Sales Group (no access - employees don't manage sales docs) *
    quotations: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    pfi: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    "purchase-orders": {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    "po-vendors": {
        can_all: false,
        can_read: false,
        can_add: false,
        can_create: false,
        can_update: false,
        can_delete: false,
    },
    tracking: {
        can_all: false,
        can_read: false,
        can_add: false,
        can_delete: false,
    },
} as const;

export type EmployeePermissions = typeof EMPLOYEE_DEFAULT_PERMISSIONS;
