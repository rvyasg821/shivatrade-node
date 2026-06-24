import { Injectable, Logger } from '@nestjs/common';
import { Command } from 'nestjs-command';

import { GrnRepository } from '@modules/grn/repository/repositories/grn.repository';
import { GrnLineRepository } from '@modules/grn/repository/repositories/grn-line.repository';
import { PoVendorRepository } from '@modules/po-vendor/repository/repositories/po-vendor.repository';
import { StockMovementRepository } from '@modules/inventory/repository/repositories/stock-movement.repository';
import { ENUM_GRN_STATUS } from '@modules/grn/enums/grn.enum';
import { ENUM_STOCK_MOVEMENT_TYPE } from '@modules/inventory/enums/stock-movement.enum';

const num = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * One-time backfill: post a `grn_in` ledger row for every already-CONFIRMED
 * GRN line so historical on-hand stock isn't lost when the ledger goes live.
 *
 * IDEMPOTENT — guarded on an existing `grn_in` row per source line, so it can
 * be re-run safely without doubling stock.
 *
 *   npx nestjs-command seed:stock-backfill
 */
@Injectable()
export class MigrationStockBackfillSeed {
    private readonly logger = new Logger(MigrationStockBackfillSeed.name);

    constructor(
        private readonly grnRepository: GrnRepository,
        private readonly grnLineRepository: GrnLineRepository,
        private readonly povRepository: PoVendorRepository,
        private readonly stockMovementRepository: StockMovementRepository
    ) {}

    @Command({
        command: 'seed:stock-backfill',
        describe: 'Post grn_in stock movements for already-confirmed GRN lines',
    })
    async seed(): Promise<void> {
        const grns: any[] = await this.grnRepository.findAll({
            status: ENUM_GRN_STATUS.CONFIRMED,
        });
        this.logger.log(`Backfilling stock from ${grns.length} confirmed GRNs…`);

        // Cache POV → delivery_address_id (location) lookups.
        const locationByPov = new Map<string, string | null>();
        let posted = 0;
        let skipped = 0;

        for (const grn of grns) {
            const companyId = grn.company_id?.toString();
            const grnId = grn._id.toString();
            const povId = grn.po_vendor_id?.toString() || null;

            let locationId: string | null = null;
            if (povId) {
                if (!locationByPov.has(povId)) {
                    const pov: any = await this.povRepository.findOneById(povId);
                    locationByPov.set(
                        povId,
                        pov?.delivery_address_id || null
                    );
                }
                locationId = locationByPov.get(povId) || null;
            }

            const lines: any[] = await this.grnLineRepository.findByGrnId(grnId);
            for (const l of lines) {
                const acceptedQty = num(l.accepted_qty);
                if (acceptedQty <= 0) continue;

                const sourceLineId = l._id.toString();
                // Idempotency guard — skip if a grn_in already exists for it.
                const existing = await this.stockMovementRepository.findAll({
                    source_type: 'grn',
                    source_line_id: sourceLineId,
                    movement_type: ENUM_STOCK_MOVEMENT_TYPE.GRN_IN,
                });
                if (existing.length > 0) {
                    skipped++;
                    continue;
                }

                await this.stockMovementRepository.create({
                    company_id: companyId,
                    location_id: locationId,
                    product_id: l.product_id,
                    qty: String(acceptedQty),
                    movement_type: ENUM_STOCK_MOVEMENT_TYPE.GRN_IN,
                    source_type: 'grn',
                    source_id: grnId,
                    source_line_id: sourceLineId,
                    source_voucher_no: grn.voucher_no || null,
                    notes: 'backfill',
                } as any);
                posted++;
            }
        }

        this.logger.log(
            `Stock backfill done — posted ${posted}, skipped ${skipped} (already present).`
        );
    }
}
