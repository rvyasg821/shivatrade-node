import { Module } from '@nestjs/common';
import { QuotationRepositoryModule } from './repository/quotation.repository.module';
import { QuotationService } from './services/quotation.service';
import { QuotationAdminController } from './controllers/quotation.admin.controller';
import { CustomerModule } from '@modules/customer/customer.module';
import { CurrencyModule } from '@modules/currency/currency.module';
import { ProductModule } from '@modules/product/product.module';
import { LeadModule } from '@modules/lead/lead.module';
import { CompanyModule } from '@modules/company/company.module';
// CompanyModule imports but does not re-export its repository module, so
// pull it in directly for access to CompanyAddressRepository.
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';

@Module({
    imports: [
        QuotationRepositoryModule,
        CustomerModule,
        CurrencyModule,
        ProductModule,
        LeadModule,
        CompanyModule,
        CompanyRepositoryModule,
    ],
    providers: [QuotationService],
    exports: [QuotationRepositoryModule, QuotationService],
    controllers: [QuotationAdminController],
})
export class QuotationModule {}
