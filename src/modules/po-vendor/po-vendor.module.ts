import { Module } from '@nestjs/common';
import { PoVendorRepositoryModule } from './repository/po-vendor.repository.module';
import { PoVendorService } from './services/po-vendor.service';
import { PoCoverageService } from './services/po-coverage.service';
import { PoVendorPdfService } from './services/po-vendor-pdf.service';
import { PoVendorAdminController } from './controllers/po-vendor.admin.controller';
import { PoVendorPublicController } from './controllers/po-vendor.public.controller';

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
// Company logo for the shared PDF letterhead lives on company-settings.
import { CompanySettingsRepositoryModule } from '@modules/company-settings/repository/company-settings.repository.module';

/**
 * POV (PO Vendor) module — Phase 5: admin controller wired in.
 */
@Module({
    imports: [
        PoVendorRepositoryModule,
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
        CompanySettingsRepositoryModule,
    ],
    providers: [PoVendorService, PoCoverageService, PoVendorPdfService],
    exports: [
        PoVendorRepositoryModule,
        PoVendorService,
        PoCoverageService,
        PoVendorPdfService,
    ],
    controllers: [PoVendorAdminController, PoVendorPublicController],
})
export class PoVendorModule {}
