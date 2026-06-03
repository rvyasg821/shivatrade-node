import { Module } from '@nestjs/common';
import { RfqRepositoryModule } from './repository/rfq.repository.module';
import { RfqService } from './services/rfq.service';
import { RfqAdminController } from './controllers/rfq.admin.controller';
import { LeadRepositoryModule } from '@modules/lead/repository/lead.repository.module';
import { ProductRepositoryModule } from '@modules/product/repository/product.repository.module';
import { VendorRepositoryModule } from '@modules/vendor/repository/vendor.repository.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { PriceListRepositoryModule } from '@modules/price-list/repository/price-list.repository.module';

@Module({
    imports: [
        RfqRepositoryModule,
        LeadRepositoryModule,
        ProductRepositoryModule,
        VendorRepositoryModule,
        CompanyRepositoryModule,
        PriceListRepositoryModule,
    ],
    providers: [RfqService],
    exports: [RfqService, RfqRepositoryModule],
    controllers: [RfqAdminController],
})
export class RfqModule {}
