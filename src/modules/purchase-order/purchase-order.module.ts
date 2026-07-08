import { Module } from '@nestjs/common';
import { CreatorScopeModule } from '@modules/creator-scope/creator-scope.module';
import { PurchaseOrderRepositoryModule } from './repository/purchase-order.repository.module';
import { PurchaseOrderService } from './services/purchase-order.service';
import { PoPdfService } from './services/po-pdf.service';
import { PurchaseOrderAdminController } from './controllers/purchase-order.admin.controller';
import { VendorModule } from '@modules/vendor/vendor.module';
import { ProductModule } from '@modules/product/product.module';
import { CustomerModule } from '@modules/customer/customer.module';
import { CompanyModule } from '@modules/company/company.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { LocationRepositoryModule } from '@modules/location/repository/location.repository.module';
import { QuotationModule } from '@modules/quotation/quotation.module';
import { LeadRepositoryModule } from '@modules/lead/repository/lead.repository.module';
import { PfiModule } from '@modules/pfi/pfi.module';
import { PriceListModule } from '@modules/price-list/price-list.module';
import { PoVendorModule } from '@modules/po-vendor/po-vendor.module';
// Company logo for the shared PDF letterhead lives on company-settings.
import { CompanySettingsRepositoryModule } from '@modules/company-settings/repository/company-settings.repository.module';
import { DependencyCheckModule } from '@modules/dependency-check/dependency-check.module';

@Module({
    imports: [
        CreatorScopeModule,
        PurchaseOrderRepositoryModule,
        DependencyCheckModule,
        VendorModule,
        ProductModule,
        CustomerModule,
        CompanyModule,
        CompanyRepositoryModule,
        LocationRepositoryModule,
        QuotationModule,
        LeadRepositoryModule,
        PfiModule,
        PriceListModule,
        PoVendorModule,
        CompanySettingsRepositoryModule,
    ],
    providers: [PurchaseOrderService, PoPdfService],
    exports: [PurchaseOrderRepositoryModule, PurchaseOrderService, PoPdfService],
    controllers: [PurchaseOrderAdminController],
})
export class PurchaseOrderModule {}
