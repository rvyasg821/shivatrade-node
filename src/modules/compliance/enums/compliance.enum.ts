export enum ENUM_IMMIGRATION_STATUS {
    BRITISH_CITIZEN = 'british_citizen',
    EU_SETTLED = 'eu_settled',
    EU_PRE_SETTLED = 'eu_pre_settled',
    VISA_HOLDER = 'visa_holder',
    ILR = 'ilr',
    OTHER = 'other',
}

export enum ENUM_IMMIGRATION_RECORD_STATUS {
    ACTIVE = 'active',
    EXPIRING = 'expiring',
    EXPIRED = 'expired',
    ACTION_REQUIRED = 'action_required',
}

export enum ENUM_RTW_CHECK_TYPE {
    MANUAL = 'manual',
    DIGITAL_SHARE_CODE = 'digital_share_code',
    EMPLOYER_CHECKING_SERVICE = 'employer_checking_service',
}

export enum ENUM_RTW_CHECK_RESULT {
    PASSED = 'passed',
    FAILED = 'failed',
    PENDING = 'pending',
}

export enum ENUM_COMPLIANCE_EVENT_TYPE {
    ABSENCE_10_DAYS = 'absence_10_days',
    ROLE_CHANGE = 'role_change',
    SALARY_CHANGE = 'salary_change',
    RESIGNATION = 'resignation',
    TERMINATION = 'termination',
    WORKING_HOURS_BREACH = 'working_hours_breach',
    VISA_EXPIRY = 'visa_expiry',
    FAILED_RTW_CHECK = 'failed_rtw_check',
    ADDRESS_CHANGE = 'address_change',
    CUSTOM = 'custom',
}

export enum ENUM_COMPLIANCE_EVENT_STATUS {
    PENDING = 'pending',
    REPORTED = 'reported',
    OVERDUE = 'overdue',
    NOT_APPLICABLE = 'not_applicable',
}
