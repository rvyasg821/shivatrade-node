import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_UOM_STATUS } from '@modules/uom/enums/uom.enum';
import { UOM_COLLECTION_NAME } from '@modules/uom/constants/uom.entity.constant';

/**
 * Unit-of-measure master.
 *
 * Replaces the hardcoded `ENUM_PRODUCT_UOM`, which meant a new unit needed a
 * code change and a redeploy. Reference data shared by every company — like the
 * geo masters and `port_master`, there is no `company_id` here on purpose.
 *
 * `code` is the string every existing record already holds ("KG", "Nos"), so
 * the seed MUST reproduce the 14 enum values byte-for-byte. Products, SO lines,
 * POV lines and invoice lines all store the unit as loose text with no foreign
 * key; the master is what gives that text meaning.
 */
@Entity(UOM_COLLECTION_NAME)
export class UomEntity extends DatabaseObjectIdEntityBase {
    /** Canonical value stored on products and lines — "KG", "Nos", "Tonne". */
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 30, nullable: false })
    code: string;

    /** Human label for the dropdown — "Kilogram". Falls back to `code`. */
    @Column({ type: 'varchar', length: 100, nullable: true })
    name?: string;

    /**
     * GST Unit Quantity Code — what actually prints on GSTR-1 and the Shipping
     * Bill ("KGS", "PCS", "MTS"). It lived in a `mapUomToUqc` helper that was
     * copy-pasted into three frontend files and only covered 9 of the 14 units;
     * the other 6 silently emitted "OTH" onto real GST paperwork. Keeping it on
     * the row means there is one answer, and the client can correct it.
     */
    @Column({ type: 'varchar', length: 10, nullable: true })
    uqc_code?: string;

    /**
     * Whether fractional quantities make sense. FALSE for countable units — you
     * cannot ship 2.5 boxes. This used to be a frontend-only `integer` flag, so
     * the backend happily accepted 2.5 Nos; now it is stored where both sides
     * can see it.
     */
    @Column({ type: 'boolean', default: true })
    allow_decimal: boolean;

    /** Dropdown ordering. Ties break on `code`. */
    @Column({ type: 'int', default: 0 })
    sort_order: number;

    @Index()
    @Column({
        type: 'varchar',
        nullable: false,
        default: ENUM_UOM_STATUS.ACTIVE,
    })
    status: ENUM_UOM_STATUS;
}

export type UomDoc = UomEntity;
