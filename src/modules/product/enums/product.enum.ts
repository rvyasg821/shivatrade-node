export enum ENUM_PRODUCT_STATUS {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
}

/**
 * Common units of measure used in trading / import-export.
 * The frontend renders these as a hardcoded dropdown; the column is just varchar
 * so admins can override later if needed.
 */
export enum ENUM_PRODUCT_UOM {
    KG = 'KG',
    MT = 'MT',
    TONNE = 'Tonne',
    PIECE = 'Piece',
    PACK = 'Pack',
    BOX = 'Box',
    LITRE = 'Litre',
    ML = 'ML',
    METER = 'Meter',
    CM = 'CM',
    BAG = 'Bag',
    PALLET = 'Pallet',
    CONTAINER = 'Container',
}
