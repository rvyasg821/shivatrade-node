import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PFI_LINE_COLLECTION_NAME } from '../../constants/pfi.entity.constant';

@Entity(PFI_LINE_COLLECTION_NAME)
export class PfiLineEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    pfi_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    /** Vendor selected on the PFI line — copied from source quotation_line. */
    @Index()
    @Column({ type: 'uuid', nullable: true })
    vendor_id?: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    qty: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    unit?: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    unit_price: string;

    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, default: 0 })
    discount_pct?: string;

    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, default: 0 })
    tax_pct?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, default: 0 })
    cgst?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, default: 0 })
    sgst?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, default: 0 })
    igst?: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    taxable: string;

    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, default: 0 })
    line_total: string;

    @Column({ type: 'int', nullable: false, default: 0 })
    seq: number;
}

export type PfiLineDoc = PfiLineEntity;
