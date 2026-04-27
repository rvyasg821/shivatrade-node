export const MODULES_PERMISSIONS = {
    modules: {
        user: {
            name: "User Management",
            description: "Manage user accounts and profiles",
            permissions: [ "can_all", "can_read", "can_add", "can_update", "can_delete" ],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        role: {
            name: "Role Management",
            description: "Manage roles and permissions",
            permissions: [ "can_all", "can_read", "can_add", "can_update", "can_delete" ],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        // setting: {
        //     name: "Settings Management",
        //     description: "Manage system settings and configurations",
        //     permissions: [ "can_all", "can_read", "can_add", "can_update", "can_delete" ],
        //     default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        // },
        company: {
            name: "Company Management",
            description: "Manage company information and profiles",
            permissions: [ "can_all", "can_read", "can_add", "can_update", "can_delete" ],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        plans: {
            name: "Plan Management",
            description: "Manage plan",
            permissions: [ "can_all", "can_read", "can_add", "can_update", "can_delete" ],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        subscription: {
            name: "Subscription Management",
            description: "Manage subscriptions",
            permissions: [ "can_all", "can_read", "can_add", "can_update", "can_delete" ],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        payments: {
            name: "Payment Management",
            description: "Manage payments",
            permissions: [ "can_all", "can_read", "can_add", "can_update", "can_delete" ],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        discount: {
            name: "Discount Management",
            description: "Manage discount codes and promotions",
            permissions: [ "can_all", "can_read", "can_add", "can_update", "can_delete" ],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        tools: {
            name: "Tools Management",
            description: "Manage tools and applications",
            permissions: [ "can_all", "can_read", "can_add", "can_update", "can_delete" ],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        location: {
            name: "Location Management",
            description: "Manage company locations",
            permissions: [ "can_all", "can_read", "can_add", "can_update", "can_delete" ],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        employee: {
            name: "Employee Management",
            description: "Manage employees",
            permissions: [ "can_all", "can_read", "can_add", "can_update", "can_delete" ],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        holiday_calendar: {
            name: "Holiday Calendar",
            description: "Manage company and location holiday calendars",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        document: {
            name: "Document Management",
            description: "Manage employee documents and files",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        contract: {
            name: "Contract Management",
            description: "Manage employment contracts and templates",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        leave: {
            name: "Leave Management",
            description: "Manage employee leave requests and entitlements",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        attendance: {
            name: "Attendance Management",
            description: "Manage employee attendance and clock in/out",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        shift: {
            name: "Shift Management",
            description: "Manage employee shifts and rotas",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        compliance: {
            name: "Compliance Management",
            description: "Manage home office compliance and immigration records",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        categories: {
            name: "Categories",
            description: "Manage product and vendor categories",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        products: {
            name: "Products",
            description: "Manage product / item master used in quotations, POs, price lists",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        vendors: {
            name: "Vendors",
            description: "Manage vendor master with contacts, payment terms and incoterms",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        customers: {
            name: "Customers",
            description: "Manage customer master with contacts and address",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        currencies: {
            name: "Currencies",
            description: "Manage currencies and exchange rates",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
    },
    version: "1.0.0",
    lastUpdated: "2025-09-26"
} as const;

export type ModulePermissions = typeof MODULES_PERMISSIONS;