import { Module } from '@nestjs/common';
import { RfqRepositoryModule } from './repository/rfq.repository.module';
import { RfqService } from './services/rfq.service';
import { RfqVendorSheetService } from './services/rfq-vendor-sheet.service';
import { RfqAdminController } from './controllers/rfq.admin.controller';
import { LeadModule } from '@modules/lead/lead.module';
import { ProductRepositoryModule } from '@modules/product/repository/product.repository.module';
import { VendorRepositoryModule } from '@modules/vendor/repository/vendor.repository.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { PriceListModule } from '@modules/price-list/price-list.module';

@Module({
    imports: [
        RfqRepositoryModule,
        LeadModule,
        ProductRepositoryModule,
        VendorRepositoryModule,
        CompanyRepositoryModule,
        // Full PriceListModule (not just the repo) — the RFQ vendor-price import
        // reuses the price-list Excel parser + create/upsert services.
        PriceListModule,
    ],
    providers: [RfqService, RfqVendorSheetService],
    exports: [RfqService, RfqRepositoryModule],
    controllers: [RfqAdminController],
})
export class RfqModule {}
