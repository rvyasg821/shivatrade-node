export enum ENUM_REBATE_STATUS {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
}

/**
 * What value the rebate percentage is applied against on a costing-sheet line.
 *  - VALUE: line value (qty × rate after discount)
 *  - TOTAL_AFTER_EXPENSES: value + packing + transport + CHA (DBK pattern)
 *  - FOB: FOB amount (RODTEP pattern)
 */
export enum ENUM_REBATE_APPLIES_ON {
    VALUE = 'value',
    TOTAL_AFTER_EXPENSES = 'total_after_expenses',
    FOB = 'fob',
}
