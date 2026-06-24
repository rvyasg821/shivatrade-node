import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { STOCK_MOVEMENT_COLLECTION_NAME } from '../../constants/inventory.entity.constant';
import { ENUM_STOCK_MOVEMENT_TYPE } from '../../enums/stock-movement.enum';

/**
 * The stock ledger. One signed row per stock event. On-hand for a product (and
 * location) is always `SUM(qty)` over active rows (`deleted = false`). There is
 * deliberately no cached `product.on_hand` column to drift out of sync.
 */
@Entity(STOCK_MOVEMENT_COLLECTION_NAME)
// on-hand SUM lookup
@Index(['company_id', 'product_id', 'location_id', 'deleted'])
// reversal lookup (find a source doc's movements)
@Index(['source_type', 'source_id'])
export class StockMovementEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'uuid', nullable: false })
    company_id: string;

    // Warehouse. On-hand is per (product, location). Single-tenant: company
    // primary location. Nullable for movements without an explicit location.
    @Index()
    @Column({ type: 'uuid', nullable: true })
    location_id?: string;

    @Index()
    @Column({ type: 'uuid', nullable: false })
    product_id: string;

    // Signed qty: + for IN, − for OUT. numeric → returned as string by TypeORM.
    @Column({ type: 'numeric', precision: 18, scale: 4, nullable: false })
    qty: string;

    @Column({ type: 'varchar', length: 30, nullable: false })
    movement_type: ENUM_STOCK_MOVEMENT_TYPE;

    // grn | invoice | manual
    @Column({ type: 'varchar', length: 20, nullable: false })
    source_type: string;

    @Column({ type: 'uuid', nullable: true })
    source_id?: string;

    // grn_line_id / invoice_line_id — one movement per source line.
    @Column({ type: 'uuid', nullable: true })
    source_line_id?: string;

    // Snapshot of the source voucher number for the Inventory movement list.
    @Column({ type: 'varchar', length: 60, nullable: true })
    source_voucher_no?: string;

    @Column({ type: 'text', nullable: true })
    notes?: string;
}
