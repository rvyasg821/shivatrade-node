export enum ENUM_CONTRACT_TEMPLATE_STATUS {
    DRAFT = 'draft',
    ACTIVE = 'active',
    ARCHIVED = 'archived',
}

export enum ENUM_CONTRACT_STATUS {
    DRAFT = 'draft',
    ISSUED = 'issued',
    PENDING_SIGNATURE = 'pending_signature',
    SIGNED = 'signed',
    EXPIRED = 'expired',
    TERMINATED = 'terminated',
}

export enum ENUM_CONTRACT_FIELD_TYPE {
    TEXT = 'text',
    NUMBER = 'number',
    DATE = 'date',
    SELECT = 'select',
    MULTI_SELECT = 'multi_select',
    TEXTAREA = 'textarea',
    EMAIL = 'email',
    PHONE = 'phone',
    ADDRESS = 'address',
    CURRENCY = 'currency',
}
