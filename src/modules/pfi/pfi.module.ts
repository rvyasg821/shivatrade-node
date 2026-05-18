import { Module } from '@nestjs/common';
import { PfiRepositoryModule } from './repository/pfi.repository.module';
import { PfiService } from './services/pfi.service';
import { PfiPdfService } from './services/pfi-pdf.service';
import { PfiAdminController } from './controllers/pfi.admin.controller';
import { PfiPublicController } from './controllers/pfi.public.controller';
import { CustomerModule } from '@modules/customer/customer.module';
import { CurrencyModule } from '@modules/currency/currency.module';
import { ProductModule } from '@modules/product/product.module';
import { VendorModule } from '@modules/vendor/vendor.module';
import { ExpenseModule } from '@modules/expense/expense.module';
import { RebateModule } from '@modules/rebate/rebate.module';
import { CompanyModule } from '@modules/company/company.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { QuotationModule } from '@modules/quotation/quotation.module';
import { LeadModule } from '@modules/lead/lead.module';

@Module({
    imports: [
        PfiRepositoryModule,
        CustomerModule,
        CurrencyModule,
        ProductModule,
        VendorModule,
        ExpenseModule,
        RebateModule,
        CompanyModule,
        CompanyRepositoryModule,
        QuotationModule,
        LeadModule,
    ],
    providers: [PfiService, PfiPdfService],
    exports: [PfiRepositoryModule, PfiService, PfiPdfService],
    controllers: [PfiAdminController, PfiPublicController],
})
export class PfiModule {}
