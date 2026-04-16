export enum ENUM_PAY_FREQUENCY {
    WEEKLY = 'weekly',
    BIWEEKLY = 'biweekly',
    SEMI_MONTHLY = 'semi_monthly',
    MONTHLY = 'monthly',
}

export enum ENUM_PAY_RUN_STATUS {
    DRAFT = 'draft',
    CALCULATED = 'calculated',
    APPROVED = 'approved',
    PAID = 'paid',
    CANCELLED = 'cancelled',
}

export enum ENUM_LINE_ITEM_TYPE {
    EARNING = 'earning',
    DEDUCTION = 'deduction',
}

export enum ENUM_LINE_ITEM_CATEGORY {
    // Earnings
    BASE = 'base',
    OVERTIME = 'overtime',
    BONUS = 'bonus',
    ALLOWANCE = 'allowance',
    COMMISSION = 'commission',
    HOLIDAY_PAY = 'holiday_pay',
    OTHER_EARNING = 'other_earning',
    // Deductions
    PENSION_EMPLOYEE = 'pension_employee',
    UNPAID_LEAVE = 'unpaid_leave',
    TAX = 'tax',
    NI = 'ni',
    STUDENT_LOAN = 'student_loan',
    COURT_ORDER = 'court_order',
    OTHER_DEDUCTION = 'other_deduction',
}

export enum ENUM_PAY_ELEMENT_CALCULATION {
    FIXED = 'fixed',
    PERCENTAGE = 'percentage',
}
