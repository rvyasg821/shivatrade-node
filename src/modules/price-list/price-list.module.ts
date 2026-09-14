import { Module, forwardRef } from '@nestjs/common';
import { RoleModule } from '@modules/role/role.module';
import { PriceListRepositoryModule } from './repository/price-list.repository.module';
import { PriceListService } from './services/price-list.service';
import { PriceListImportExportService } from './services/price-list.import-export.service';
import { PriceListAdminController } from './controllers/price-list.admin.controller';
import { VendorModule } from '@modules/vendor/vendor.module';
import { ProductModule } from '@modules/product/product.module';
import { CurrencyModule } from '@modules/currency/currency.module';
import { TrackingModule } from '@modules/tracking/tracking.module';

@Module({
    imports: [
        PriceListRepositoryModule,
        forwardRef(() => RoleModule),
        VendorModule,
        ProductModule,
        CurrencyModule,
        // For AuditLogService — one summary audit row per bulk import.
        TrackingModule,
    ],
    providers: [PriceListService, PriceListImportExportService],
    exports: [
        PriceListRepositoryModule,
        PriceListService,
        PriceListImportExportService,
    ],
    controllers: [PriceListAdminController],
})
export class PriceListModule {}
