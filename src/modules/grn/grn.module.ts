import { Module } from '@nestjs/common';
import { GrnRepositoryModule } from './repository/grn.repository.module';
import { GrnService } from './services/grn.service';
import { GrnAdminController } from './controllers/grn.admin.controller';
import { PoVendorRepositoryModule } from '@modules/po-vendor/repository/po-vendor.repository.module';
import { PurchaseOrderRepositoryModule } from '@modules/purchase-order/repository/purchase-order.repository.module';
import { ProductRepositoryModule } from '@modules/product/repository/product.repository.module';
import { VendorRepositoryModule } from '@modules/vendor/repository/vendor.repository.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';

@Module({
    imports: [
        GrnRepositoryModule,
        PoVendorRepositoryModule,
        PurchaseOrderRepositoryModule,
        ProductRepositoryModule,
        VendorRepositoryModule,
        CompanyRepositoryModule,
    ],
    providers: [GrnService],
    exports: [GrnService, GrnRepositoryModule],
    controllers: [GrnAdminController],
})
export class GrnModule {}
