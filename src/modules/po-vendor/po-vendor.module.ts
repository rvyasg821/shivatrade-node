import { Module } from '@nestjs/common';
import { PoVendorRepositoryModule } from './repository/po-vendor.repository.module';
import { PoVendorService } from './services/po-vendor.service';
import { PoCoverageService } from './services/po-coverage.service';
import { PoVendorAdminController } from './controllers/po-vendor.admin.controller';

import { PurchaseOrderRepositoryModule } from '@modules/purchase-order/repository/purchase-order.repository.module';
import { VendorModule } from '@modules/vendor/vendor.module';
import { ProductModule } from '@modules/product/product.module';
import { CompanyModule } from '@modules/company/company.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { VoucherModule } from '@common/voucher/voucher.module';

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
        VoucherModule,
    ],
    providers: [PoVendorService, PoCoverageService],
    exports: [PoVendorRepositoryModule, PoVendorService, PoCoverageService],
    controllers: [PoVendorAdminController],
})
export class PoVendorModule {}
