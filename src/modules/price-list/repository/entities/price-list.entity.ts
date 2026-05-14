import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { PRICE_LIST_COLLECTION_NAME } from '../../constants/price-list.entity.constant';

@Entity(PRICE_LIST_COLLECTION_NAME)
export class PriceListEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Column({ type: 'uuid', nullable: true })
    created_by: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    vendor_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    currency_id: string;

    /** Unit price in `currency_id`. Stored as numeric for precision. */
    @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false })
    unit_price: string;

    /** Minimum order quantity. */
    @Column({ type: 'int', nullable: true, default: 1 })
    moq?: number;

    /** Discount percentage offered by the vendor. */
    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
    discount_pct?: string;

    /** Default margin % for this (vendor, product) row. Auto-fills the
     *  quotation/PFI line on vendor pick. Quotation-line margin overrides. */
    @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
    margin_pct?: string;

    /** Vendor lead time in days from PO to ready-to-ship. */
    @Column({ type: 'int', nullable: true })
    lead_time_days?: number;

    @Index()
    @Column({ type: 'date', nullable: false })
    effective_date: string;

    /** Explicit quote expiry. Null = no explicit expiry; falls back to the
     *  next row's effective_date for display purposes (auto-derived). */
    @Column({ type: 'date', nullable: true })
    valid_until?: string;

    /** When true, this row is the default vendor source for the product. At
     *  most one primary per (company, product) — service enforces this. */
    @Index()
    @Column({ type: 'boolean', default: false })
    is_primary: boolean;

    @Column({ type: 'text', nullable: true })
    notes?: string;
}

export type PriceListDoc = PriceListEntity;
