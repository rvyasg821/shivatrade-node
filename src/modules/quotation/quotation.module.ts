import { Module } from '@nestjs/common';
import { QuotationRepositoryModule } from './repository/quotation.repository.module';
import { QuotationService } from './services/quotation.service';
import { QuotationAdminController } from './controllers/quotation.admin.controller';
import { CustomerModule } from '@modules/customer/customer.module';
import { CurrencyModule } from '@modules/currency/currency.module';
import { ProductModule } from '@modules/product/product.module';
import { LeadModule } from '@modules/lead/lead.module';
import { CompanyModule } from '@modules/company/company.module';

@Module({
    imports: [
        QuotationRepositoryModule,
        CustomerModule,
        CurrencyModule,
        ProductModule,
        LeadModule,
        CompanyModule,
    ],
    providers: [QuotationService],
    exports: [QuotationRepositoryModule, QuotationService],
    controllers: [QuotationAdminController],
})
export class QuotationModule {}
