export enum ENUM_MESSAGE_LOG_CHANNEL {
    EMAIL = 'email',
    SMS = 'sms',
    WHATSAPP = 'whatsapp',
}

export enum ENUM_MESSAGE_LOG_STATUS {
    QUEUED = 'queued',
    SENT = 'sent',
    FAILED = 'failed',
    SKIPPED = 'skipped',
}

export enum ENUM_MESSAGE_LOG_RECIPIENT_TYPE {
    COMPANY_ADMIN = 'company_admin',
    LOCATION_ADMIN = 'location_admin',
    EMPLOYEE = 'employee',
    EXTERNAL = 'external',
    SYSTEM = 'system',
}
