import { Module } from '@nestjs/common';
import { GrnRepositoryModule } from './repository/grn.repository.module';
import { GrnService } from './services/grn.service';
import { DebitNoteService } from './services/debit-note.service';
import { GrnAdminController } from './controllers/grn.admin.controller';
import { DebitNoteAdminController } from './controllers/debit-note.admin.controller';
import { PoVendorRepositoryModule } from '@modules/po-vendor/repository/po-vendor.repository.module';
import { PurchaseOrderRepositoryModule } from '@modules/purchase-order/repository/purchase-order.repository.module';
import { ProductRepositoryModule } from '@modules/product/repository/product.repository.module';
import { VendorRepositoryModule } from '@modules/vendor/repository/vendor.repository.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { TrackingEventRepositoryModule } from '@modules/tracking-event/repository/tracking-event.repository.module';
// Company logo for the shared PDF letterhead lives on company-settings.
import { CompanySettingsRepositoryModule } from '@modules/company-settings/repository/company-settings.repository.module';
// Stock ledger (Goods In) — GRN confirm posts grn_in movements.
import { InventoryModule } from '@modules/inventory/inventory.module';

@Module({
    imports: [
        GrnRepositoryModule,
        PoVendorRepositoryModule,
        PurchaseOrderRepositoryModule,
        ProductRepositoryModule,
        VendorRepositoryModule,
        CompanyRepositoryModule,
        TrackingEventRepositoryModule,
        CompanySettingsRepositoryModule,
        InventoryModule,
    ],
    providers: [GrnService, DebitNoteService],
    exports: [GrnService, DebitNoteService, GrnRepositoryModule],
    controllers: [GrnAdminController, DebitNoteAdminController],
})
export class GrnModule {}
