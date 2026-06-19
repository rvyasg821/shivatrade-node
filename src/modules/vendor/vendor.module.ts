import { Module } from '@nestjs/common';
import { VendorRepositoryModule } from './repository/vendor.repository.module';
import { VendorService } from './services/vendor.service';
import { VendorImportExportService } from './services/vendor.import-export.service';
import { VendorAdminController } from './controllers/vendor.admin.controller';
import { CategoryModule } from '@modules/category/category.module';
import { CurrencyModule } from '@modules/currency/currency.module';
import { UserModule } from '@modules/user/user.module';
import { RoleModule } from '@modules/role/role.module';
import { AuthModule } from '@modules/auth/auth.module';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';

@Module({
    imports: [
        VendorRepositoryModule,
        CategoryModule,
        CurrencyModule,
        UserModule,
        RoleModule,
        AuthModule,
        CompanySettingsModule,
    ],
    providers: [VendorService, VendorImportExportService],
    exports: [VendorRepositoryModule, VendorService, VendorImportExportService],
    controllers: [VendorAdminController],
})
export class VendorModule {}
