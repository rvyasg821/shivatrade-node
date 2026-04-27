import { Module } from '@nestjs/common';
import { VendorRepositoryModule } from './repository/vendor.repository.module';
import { VendorService } from './services/vendor.service';
import { VendorAdminController } from './controllers/vendor.admin.controller';
import { CategoryModule } from '@modules/category/category.module';
import { UserModule } from '@modules/user/user.module';
import { RoleModule } from '@modules/role/role.module';
import { AuthModule } from '@modules/auth/auth.module';

@Module({
    imports: [VendorRepositoryModule, CategoryModule, UserModule, RoleModule, AuthModule],
    providers: [VendorService],
    exports: [VendorRepositoryModule, VendorService],
    controllers: [VendorAdminController],
})
export class VendorModule {}
