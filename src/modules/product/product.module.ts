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
import { HsnPropagationModule } from '@modules/hsn-propagation/hsn-propagation.module';
import { DependencyCheckModule } from '@modules/dependency-check/dependency-check.module';

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
        // Cascade a product's HSN onto every document line that uses it.
        HsnPropagationModule,
        DependencyCheckModule,
    ],
    providers: [ProductService, ProductImportExportService],
    exports: [
        ProductRepositoryModule,
        ProductService,
        ProductImportExportService,
        // Re-exported so ProductAdminController (registered in RoutesAdminModule)
        // can inject HsnPropagationService.
        HsnPropagationModule,
    ],
    controllers: [ProductAdminController],
})
export class ProductModule {}
