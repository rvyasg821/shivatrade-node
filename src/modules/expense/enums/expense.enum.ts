export enum ENUM_EXPENSE_STATUS {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
}

/** Whether `value` is a percentage of the base, or a flat amount. */
export enum ENUM_EXPENSE_TYPE {
    PERCENT = 'percent',
    FIXED = 'fixed',
}

/** What `value` is multiplied against on a costing-sheet line. */
export enum ENUM_EXPENSE_BASE {
    VALUE = 'value', // line value (qty × rate after discount)
    QTY = 'qty', // per unit / piece
    WEIGHT = 'weight', // per kg
}
