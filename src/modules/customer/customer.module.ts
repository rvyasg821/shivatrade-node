import { Module } from '@nestjs/common';
import { CreatorScopeModule } from '@modules/creator-scope/creator-scope.module';
import { CustomerRepositoryModule } from './repository/customer.repository.module';
import { CustomerService } from './services/customer.service';
import { CustomerImportExportService } from './services/customer.import-export.service';
import { CustomerAdminController } from './controllers/customer.admin.controller';
import { UserModule } from '@modules/user/user.module';
import { RoleModule } from '@modules/role/role.module';
import { AuthModule } from '@modules/auth/auth.module';
import { DependencyCheckModule } from '@modules/dependency-check/dependency-check.module';

@Module({
    imports: [CustomerRepositoryModule, UserModule, RoleModule, AuthModule, DependencyCheckModule, CreatorScopeModule],
    providers: [CustomerService, CustomerImportExportService],
    exports: [
        CustomerRepositoryModule,
        CustomerService,
        CustomerImportExportService,
    ],
    controllers: [CustomerAdminController],
})
export class CustomerModule {}
