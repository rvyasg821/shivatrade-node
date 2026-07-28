import { Module } from '@nestjs/common';
import { VendorCategoryRepositoryModule } from './repository/vendor-category.repository.module';
import { VendorCategoryService } from './services/vendor-category.service';
import { VendorCategoryImportExportService } from './services/vendor-category.import-export.service';
import { VendorCategoryAdminController } from './controllers/vendor-category.admin.controller';
import { VendorRepositoryModule } from '@modules/vendor/repository/vendor.repository.module';

@Module({
    imports: [VendorCategoryRepositoryModule, VendorRepositoryModule],
    providers: [VendorCategoryService, VendorCategoryImportExportService],
    exports: [
        VendorCategoryRepositoryModule,
        VendorCategoryService,
        VendorCategoryImportExportService,
    ],
    controllers: [VendorCategoryAdminController],
})
export class VendorCategoryModule {}
