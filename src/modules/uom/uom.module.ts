import { Module } from '@nestjs/common';
import { UomRepositoryModule } from './repository/uom.repository.module';
import { UomService } from './services/uom.service';
import { UomSeedService } from './services/uom-seed.service';
import { UomImportExportService } from './services/uom.import-export.service';
import { FileModule } from '@common/file/file.module';
import { UomAdminController } from './controllers/uom.admin.controller';
import { ProductRepositoryModule } from '@modules/product/repository/product.repository.module';

/**
 * Imports the product REPOSITORY (not ProductModule) for the delete guard and
 * the in-use counts. ProductModule imports THIS module to validate units, so
 * going through the repository is what keeps that from becoming a cycle.
 */
@Module({
    imports: [UomRepositoryModule, ProductRepositoryModule, FileModule.forRoot()],
    providers: [UomService, UomSeedService, UomImportExportService],
    exports: [UomRepositoryModule, UomService, UomImportExportService],
    controllers: [UomAdminController],
})
export class UomModule {}
