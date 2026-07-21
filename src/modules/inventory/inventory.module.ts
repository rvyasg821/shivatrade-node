import { Module } from '@nestjs/common';

import { InventoryService } from './services/inventory.service';
import { StockLedgerService } from './services/stock-ledger.service';
import { InventoryAdminController } from './controllers/inventory.admin.controller';
import { InventoryRepositoryModule } from './repository/inventory.repository.module';
import { FileModule } from '@common/file/file.module';

/**
 * Inventory (Received-Goods Register) — read-only view over existing POV /
 * PO / Product data. No entity, no repository, no migration: the service
 * runs raw joins via the shared DataSource.
 *
 * The admin controller is declared here (the feature-module convention used
 * across the app) so it mounts at /admin/inventory. The module is imported
 * into RoutesAdminModule. NOTE: do NOT also list the controller directly in
 * RoutesAdminModule.controllers[] — RouterModule.register prefixes those
 * with an extra '/admin', producing a stray /admin/admin/inventory route.
 */
@Module({
    // FileModule — the Closing Inventory Excel export (client #5).
    imports: [InventoryRepositoryModule, FileModule.forRoot()],
    providers: [InventoryService, StockLedgerService],
    controllers: [InventoryAdminController],
    // StockLedgerService is consumed by GRN (in) and Invoice (out) modules.
    exports: [InventoryService, StockLedgerService, InventoryRepositoryModule],
})
export class InventoryModule {}
