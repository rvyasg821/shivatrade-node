import { Module } from '@nestjs/common';
import { CustomerRepositoryModule } from './repository/customer.repository.module';
import { CustomerService } from './services/customer.service';
import { CustomerAdminController } from './controllers/customer.admin.controller';
import { UserModule } from '@modules/user/user.module';
import { RoleModule } from '@modules/role/role.module';
import { AuthModule } from '@modules/auth/auth.module';

@Module({
    imports: [CustomerRepositoryModule, UserModule, RoleModule, AuthModule],
    providers: [CustomerService],
    exports: [CustomerRepositoryModule, CustomerService],
    controllers: [CustomerAdminController],
})
export class CustomerModule {}
