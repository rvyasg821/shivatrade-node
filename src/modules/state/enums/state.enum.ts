/** Mirrors ENUM_COUNTRY_STATUS so the three geo masters share one vocabulary. */
export enum ENUM_STATE_STATUS {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

export const STATE_STATUS_VALUES = Object.values(ENUM_STATE_STATUS);
