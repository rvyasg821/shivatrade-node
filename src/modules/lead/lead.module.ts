import { Module } from '@nestjs/common';
import { LeadRepositoryModule } from './repository/lead.repository.module';
import { LeadService } from './services/lead.service';
import { LeadAdminController } from './controllers/lead.admin.controller';
import { CustomerModule } from '@modules/customer/customer.module';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';
import { ProductModule } from '@modules/product/product.module';
import { CategoryModule } from '@modules/category/category.module';

@Module({
    imports: [
        LeadRepositoryModule,
        CustomerModule,
        UserRepositoryModule,
        ProductModule,
        CategoryModule,
    ],
    providers: [LeadService],
    exports: [LeadRepositoryModule, LeadService],
    controllers: [LeadAdminController],
})
export class LeadModule {}
