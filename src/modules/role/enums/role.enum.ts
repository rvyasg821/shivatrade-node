export enum ENUM_ROLE_TYPE {
    SYSTEM = 'system',
    COMPANY = 'company',
    CUSTOM = 'custom'
}

export enum ENUM_SYSTEM_ROLE {
    SUPER_ADMIN = 'Admin', // Platform owner
    COMPANY_ADMIN = 'Company Admin', // Manages entire company + all locations
    LOCATION_ADMIN = 'Location Admin', // Manages specific location(s)
    EMPLOYEE = 'Employee', // Staff member at a location
    AGENT = 'Agent', // Sales agent - helps sell subscriptions
    VENDOR = 'Vendor', // External supplier/vendor - hidden from tenant UI, assigned internally
    CUSTOMER = 'Customer' // External customer - hidden from tenant UI, assigned internally
}

