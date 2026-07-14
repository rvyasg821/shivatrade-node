import { Module } from '@nestjs/common';
import { ProductRepositoryModule } from './repository/product.repository.module';
import { ProductService } from './services/product.service';
import { ProductImportExportService } from './services/product.import-export.service';
import { ProductAdminController } from './controllers/product.admin.controller';
import { CategoryModule } from '@modules/category/category.module';
import { CurrencyModule } from '@modules/currency/currency.module';
import { RebateModule } from '@modules/rebate/rebate.module';
import { ExpenseModule } from '@modules/expense/expense.module';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';
import { UomModule } from '@modules/uom/uom.module';

@Module({
    imports: [
        ProductRepositoryModule,
        CategoryModule,
        CurrencyModule,
        RebateModule,
        ExpenseModule,
        CompanySettingsModule,
        // Units are validated against the UOM master now, not a hardcoded enum.
        UomModule,
    ],
    providers: [ProductService, ProductImportExportService],
    exports: [
        ProductRepositoryModule,
        ProductService,
        ProductImportExportService,
    ],
    controllers: [ProductAdminController],
})
export class ProductModule {}
