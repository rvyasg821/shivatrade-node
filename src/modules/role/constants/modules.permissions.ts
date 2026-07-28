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
            description: "Manage product categories",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        "vendor-categories": {
            name: "Vendor Categories",
            description: "Manage the vendor category master (used to classify vendors)",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        "port-master": {
            name: "Port Master",
            description: "Manage ICEGATE customs ports used by Invoice + Shipping (sea/air/ICD/SEZ). Read open to all auth users.",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: true, can_add: false, can_update: false, can_delete: false }
        },
        uom: {
            name: "UOM",
            description: "Manage the unit-of-measure master (code, GST UQC code, decimals allowed) used by products and every line item",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: true, can_add: false, can_update: false, can_delete: false }
        },
        countries: {
            name: "Countries",
            description: "Manage the country master (ISO code, currency, time zone) that feeds every address dropdown",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: true, can_add: false, can_update: false, can_delete: false }
        },
        states: {
            name: "States",
            description: "Manage the state / province master under each country",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: true, can_add: false, can_update: false, can_delete: false }
        },
        cities: {
            name: "Cities",
            description: "Manage the city master under each state",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: true, can_add: false, can_update: false, can_delete: false }
        },
        reports: {
            name: "Reports",
            description: "View aggregation reports (Product-wise Profitability; HSN Summary, Customer Turnover, Monthly Turnover, Input-Output GST to follow). Read-only.",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: true, can_add: false, can_update: false, can_delete: false }
        },
        "adjustment-notes": {
            name: "Adjustment Notes",
            description: "Post off-document debit/credit adjustment notes against a customer or vendor (feeds the party ledgers). Post-on-save; Void to reverse.",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: true, can_add: true, can_update: true, can_delete: false }
        },
        invoices: {
            name: "Invoices",
            description: "Manage Export Commercial Invoices - STIPL{N}/{FY} voucher, IGST-paid + LUT routes, IGST refund footer, multi-bank, Packing List PDF.",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        shipping: {
            name: "Shipping",
            description: "Manage Export Shipments - sea + air modes, BL/AWB, shipping bill, ports (port_master), status workflow (draft→booked→dispatched→arrived→cleared→delivered), event timeline.",
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
        leads: {
            name: "Leads",
            description: "Manage sales leads, assignments and conversion to customers",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        rebates: {
            name: "Rebates",
            description: "Manage export rebate schemes (DBK, RODTEP, etc.)",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        expenses: {
            name: "Expenses",
            description: "Manage expense heads (packing, transport, CHA) used in costing",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        currencies: {
            name: "Currencies",
            description: "Manage currencies and exchange rates",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        "price-list": {
            name: "Price List",
            description: "Manage vendor pricing for products",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        quotations: {
            name: "Quotations",
            description: "Manage export quotations with costing - sent to customers as the first pricing offer",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        rfq: {
            name: "RFQ",
            description: "Manage Requests for Quotation - vendor price sourcing from lead requirement items",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        pfi: {
            name: "PFI",
            description: "Manage Proforma Invoices created from approved quotations",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        "purchase-orders": {
            name: "Purchase Orders",
            description: "Manage POs sent to vendors, generated from approved Quotations / PFIs",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        "po-vendors": {
            name: "PO Vendors",
            description: "Track vendor fulfillment against confirmed Purchase Orders - dispatch, receive, and partial-fulfillment chains.",
            permissions: ["can_all", "can_read", "can_add", "can_update", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_update: false, can_delete: false }
        },
        tracking: {
            name: "Tracking",
            description: "Append-only event log on dispatched/closed PO Vendors - ops timeline + cross-POV feed. Delete = retract with reason (Option D); the row stays in the audit log, shown struck through.",
            permissions: ["can_all", "can_read", "can_add", "can_delete"],
            default: { can_all: false, can_read: false, can_add: false, can_delete: false }
        },
        inventory: {
            name: "Inventory",
            description: "Received-goods register — read-only view of POV closures.",
            permissions: ["can_all", "can_read"],
            default: { can_all: false, can_read: false }
        },
    },
    version: "1.0.0",
    lastUpdated: "2026-05-05"
} as const;

export type ModulePermissions = typeof MODULES_PERMISSIONS;