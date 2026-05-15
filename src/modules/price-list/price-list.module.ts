import { Module } from '@nestjs/common';
import { PriceListRepositoryModule } from './repository/price-list.repository.module';
import { PriceListService } from './services/price-list.service';
import { PriceListAdminController } from './controllers/price-list.admin.controller';
import { VendorModule } from '@modules/vendor/vendor.module';
import { ProductModule } from '@modules/product/product.module';
import { CurrencyModule } from '@modules/currency/currency.module';

@Module({
    imports: [
        PriceListRepositoryModule,
        VendorModule,
        ProductModule,
        CurrencyModule,
    ],
    providers: [PriceListService],
    exports: [PriceListRepositoryModule, PriceListService],
    controllers: [PriceListAdminController],
})
export class PriceListModule {}
