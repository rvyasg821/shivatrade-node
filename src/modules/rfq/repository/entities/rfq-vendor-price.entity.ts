import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { RFQ_VENDOR_PRICE_COLLECTION_NAME } from '../../constants/rfq.entity.constant';

/**
 * One cell of the price-comparison grid: a vendor's quote for an RFQ line.
 * `is_selected` marks the chosen (usually cheapest) price per line, which
 * later seeds the Quotation's unit_price.
 */
@Entity(RFQ_VENDOR_PRICE_COLLECTION_NAME)
export class RfqVendorPriceEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    rfq_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    rfq_line_id: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    vendor_id: string;

    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false, default: 0 })
    unit_price: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    currency_code?: string;

    @Column({ type: 'int', nullable: true })
    lead_time_days?: number;

    @Column({ type: 'int', nullable: true })
    moq?: number;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    @Index()
    @Column({ type: 'boolean', default: false })
    is_selected: boolean;

    @Index()
    @Column({ type: 'boolean', default: false })
    soft_delete: boolean;
}

export type RfqVendorPriceDoc = RfqVendorPriceEntity;
