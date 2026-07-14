import { ENUM_PRODUCT_UOM } from '@modules/product/enums/product.enum';

/**
 * The 14 units that were hardcoded in `ENUM_PRODUCT_UOM`, moved into data.
 *
 * ⚠️ `code` MUST match the enum value byte-for-byte. Every existing product and
 * every SO / POV / quotation / invoice line stores this string raw, with no
 * foreign key. "Kg" instead of "KG" would orphan every product using it — the
 * dropdown would render blank and the unit would look deleted. That is why the
 * codes below are taken FROM the enum rather than retyped: a typo is impossible.
 *
 * `uqc_code` is the GST Unit Quantity Code that prints on GSTR-1 and the
 * Shipping Bill. The old frontend `mapUomToUqc` helper only knew 9 of these; MT,
 * Tonne, Bag, Pallet, Container and CM all fell through to "OTH" on live GST
 * paperwork. The correct codes are below.
 *
 * `allow_decimal: false` = countable. You cannot ship 2.5 boxes.
 */
export interface IUomSeedRow {
    code: string;
    name: string;
    uqc_code: string;
    allow_decimal: boolean;
}

export const UOM_SEED: IUomSeedRow[] = [
    // Weight
    { code: ENUM_PRODUCT_UOM.KG, name: 'Kilogram', uqc_code: 'KGS', allow_decimal: true },
    { code: ENUM_PRODUCT_UOM.MT, name: 'Metric Tonne', uqc_code: 'MTS', allow_decimal: true },
    { code: ENUM_PRODUCT_UOM.TONNE, name: 'Tonne', uqc_code: 'TON', allow_decimal: true },

    // Count
    { code: ENUM_PRODUCT_UOM.NOS, name: 'Numbers', uqc_code: 'NOS', allow_decimal: false },
    { code: ENUM_PRODUCT_UOM.PIECE, name: 'Piece', uqc_code: 'PCS', allow_decimal: false },
    { code: ENUM_PRODUCT_UOM.PACK, name: 'Pack', uqc_code: 'PAC', allow_decimal: false },
    { code: ENUM_PRODUCT_UOM.BOX, name: 'Box', uqc_code: 'BOX', allow_decimal: false },
    { code: ENUM_PRODUCT_UOM.BAG, name: 'Bag', uqc_code: 'BAG', allow_decimal: false },
    { code: ENUM_PRODUCT_UOM.PALLET, name: 'Pallet', uqc_code: 'PAL', allow_decimal: false },
    { code: ENUM_PRODUCT_UOM.CONTAINER, name: 'Container', uqc_code: 'UNT', allow_decimal: false },

    // Volume
    { code: ENUM_PRODUCT_UOM.LITRE, name: 'Litre', uqc_code: 'LTR', allow_decimal: true },
    { code: ENUM_PRODUCT_UOM.ML, name: 'Millilitre', uqc_code: 'MLT', allow_decimal: true },

    // Length
    { code: ENUM_PRODUCT_UOM.METER, name: 'Metre', uqc_code: 'MTR', allow_decimal: true },
    { code: ENUM_PRODUCT_UOM.CM, name: 'Centimetre', uqc_code: 'CMS', allow_decimal: true },
];
