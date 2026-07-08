import { Module } from '@nestjs/common';
import { CreatorScopeModule } from '@modules/creator-scope/creator-scope.module';
import { QuotationRepositoryModule } from './repository/quotation.repository.module';
import { QuotationService } from './services/quotation.service';
import { QuotationAdminController } from './controllers/quotation.admin.controller';
import { CustomerModule } from '@modules/customer/customer.module';
import { CurrencyModule } from '@modules/currency/currency.module';
import { ProductModule } from '@modules/product/product.module';
import { LeadModule } from '@modules/lead/lead.module';
import { VendorModule } from '@modules/vendor/vendor.module';
import { ExpenseModule } from '@modules/expense/expense.module';
import { RebateModule } from '@modules/rebate/rebate.module';
import { CompanyModule } from '@modules/company/company.module';
// CompanyModule imports but does not re-export its repository module, so
// pull it in directly for access to CompanyAddressRepository.
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
// Repository-only imports for child-doc guards in softDelete (avoids
// service-level cycles with PfiModule / PurchaseOrderModule).
import { PfiRepositoryModule } from '@modules/pfi/repository/pfi.repository.module';
import { PurchaseOrderRepositoryModule } from '@modules/purchase-order/repository/purchase-order.repository.module';
import { RfqRepositoryModule } from '@modules/rfq/repository/rfq.repository.module';
// Company logo for the shared PDF letterhead lives on company-settings.
import { CompanySettingsRepositoryModule } from '@modules/company-settings/repository/company-settings.repository.module';
import { DependencyCheckModule } from '@modules/dependency-check/dependency-check.module';

@Module({
    imports: [
        CreatorScopeModule,
        QuotationRepositoryModule,
        DependencyCheckModule,
        CustomerModule,
        CurrencyModule,
        ProductModule,
        LeadModule,
        VendorModule,
        ExpenseModule,
        RebateModule,
        CompanyModule,
        CompanyRepositoryModule,
        PfiRepositoryModule,
        PurchaseOrderRepositoryModule,
        RfqRepositoryModule,
        CompanySettingsRepositoryModule,
    ],
    providers: [QuotationService],
    exports: [QuotationRepositoryModule, QuotationService],
    controllers: [QuotationAdminController],
})
export class QuotationModule {}
