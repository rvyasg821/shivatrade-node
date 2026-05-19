import { Module } from '@nestjs/common';
import { PurchaseOrderRepositoryModule } from './repository/purchase-order.repository.module';
import { PurchaseOrderService } from './services/purchase-order.service';
import { PoPdfService } from './services/po-pdf.service';
import { PurchaseOrderAdminController } from './controllers/purchase-order.admin.controller';
import { VendorModule } from '@modules/vendor/vendor.module';
import { ProductModule } from '@modules/product/product.module';
import { CustomerModule } from '@modules/customer/customer.module';
import { CompanyModule } from '@modules/company/company.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { QuotationModule } from '@modules/quotation/quotation.module';
import { PfiModule } from '@modules/pfi/pfi.module';
import { PriceListModule } from '@modules/price-list/price-list.module';

@Module({
    imports: [
        PurchaseOrderRepositoryModule,
        VendorModule,
        ProductModule,
        CustomerModule,
        CompanyModule,
        CompanyRepositoryModule,
        QuotationModule,
        PfiModule,
        PriceListModule,
    ],
    providers: [PurchaseOrderService, PoPdfService],
    exports: [PurchaseOrderRepositoryModule, PurchaseOrderService, PoPdfService],
    controllers: [PurchaseOrderAdminController],
})
export class PurchaseOrderModule {}
