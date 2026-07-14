import { Module } from '@nestjs/common';
import { UomRepositoryModule } from './repository/uom.repository.module';
import { UomService } from './services/uom.service';
import { UomSeedService } from './services/uom-seed.service';
import { UomAdminController } from './controllers/uom.admin.controller';
import { ProductRepositoryModule } from '@modules/product/repository/product.repository.module';

/**
 * Imports the product REPOSITORY (not ProductModule) for the delete guard and
 * the in-use counts. ProductModule imports THIS module to validate units, so
 * going through the repository is what keeps that from becoming a cycle.
 */
@Module({
    imports: [UomRepositoryModule, ProductRepositoryModule],
    providers: [UomService, UomSeedService],
    exports: [UomRepositoryModule, UomService],
    controllers: [UomAdminController],
})
export class UomModule {}
