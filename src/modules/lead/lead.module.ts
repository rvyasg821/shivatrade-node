import { Module } from '@nestjs/common';
import { LeadRepositoryModule } from './repository/lead.repository.module';
import { LeadService } from './services/lead.service';
import { LeadActivityService } from './services/lead-activity.service';
import { LeadAdminController } from './controllers/lead.admin.controller';
import { LeadActivityAdminController } from './controllers/lead-activity.admin.controller';
import { CustomerModule } from '@modules/customer/customer.module';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';
import { ProductModule } from '@modules/product/product.module';
import { CategoryModule } from '@modules/category/category.module';
import { VendorRepositoryModule } from '@modules/vendor/repository/vendor.repository.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
// Repository-only import (no service-level cycle with QuotationModule).
import { QuotationRepositoryModule } from '@modules/quotation/repository/quotation.repository.module';
import { DependencyCheckModule } from '@modules/dependency-check/dependency-check.module';

@Module({
    imports: [
        LeadRepositoryModule,
        CustomerModule,
        UserRepositoryModule,
        ProductModule,
        CategoryModule,
        VendorRepositoryModule,
        CompanyRepositoryModule,
        QuotationRepositoryModule,
        DependencyCheckModule,
    ],
    providers: [LeadService, LeadActivityService],
    exports: [LeadRepositoryModule, LeadService, LeadActivityService],
    controllers: [LeadAdminController, LeadActivityAdminController],
})
export class LeadModule {}
