import { Module } from '@nestjs/common';
import { CreatorScopeModule } from '@modules/creator-scope/creator-scope.module';
import { PoVendorRepositoryModule } from './repository/po-vendor.repository.module';
import { PoVendorService } from './services/po-vendor.service';
import { PoVendorImportExportService } from './services/po-vendor.import-export.service';
import { PoCoverageService } from './services/po-coverage.service';
import { PoVendorPdfService } from './services/po-vendor-pdf.service';
import { PoVendorAdminController } from './controllers/po-vendor.admin.controller';

import { PurchaseOrderRepositoryModule } from '@modules/purchase-order/repository/purchase-order.repository.module';
import { VendorModule } from '@modules/vendor/vendor.module';
import { ProductModule } from '@modules/product/product.module';
import { CompanyModule } from '@modules/company/company.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { LocationRepositoryModule } from '@modules/location/repository/location.repository.module';
import { CurrencyModule } from '@modules/currency/currency.module';
import { VoucherModule } from '@common/voucher/voucher.module';
import { TrackingEventRepositoryModule } from '@modules/tracking-event/repository/tracking-event.repository.module';
import { ExpenseRepositoryModule } from '@modules/expense/repository/expense.repository.module';
import { InvoiceRepositoryModule } from '@modules/invoice/repository/invoice.repository.module';
import { PriceListRepositoryModule } from '@modules/price-list/repository/price-list.repository.module';
// Company logo for the shared PDF letterhead lives on company-settings.
import { CompanySettingsRepositoryModule } from '@modules/company-settings/repository/company-settings.repository.module';
import { DependencyCheckModule } from '@modules/dependency-check/dependency-check.module';
// Stock ledger — Generate POV reads on-hand for In Stock / To Procure.
import { InventoryModule } from '@modules/inventory/inventory.module';

/**
 * POV (PO Vendor) module — Phase 5: admin controller wired in.
 */
@Module({
    imports: [
        CreatorScopeModule,
        PoVendorRepositoryModule,
        DependencyCheckModule,
        PurchaseOrderRepositoryModule,
        VendorModule,
        ProductModule,
        CompanyModule,
        CompanyRepositoryModule,
        LocationRepositoryModule,
        CurrencyModule,
        VoucherModule,
        TrackingEventRepositoryModule,
        ExpenseRepositoryModule,
        InvoiceRepositoryModule,
        PriceListRepositoryModule,
        CompanySettingsRepositoryModule,
        InventoryModule,
    ],
    providers: [
        PoVendorService,
        PoVendorImportExportService,
        PoCoverageService,
        PoVendorPdfService,
    ],
    exports: [
        PoVendorRepositoryModule,
        PoVendorService,
        PoVendorImportExportService,
        PoCoverageService,
        PoVendorPdfService,
    ],
    controllers: [PoVendorAdminController],
})
export class PoVendorModule {}
