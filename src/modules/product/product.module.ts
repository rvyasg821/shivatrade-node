import { Module } from '@nestjs/common';
import { ProductRepositoryModule } from './repository/product.repository.module';
import { ProductService } from './services/product.service';
import { ProductImportExportService } from './services/product.import-export.service';
import { ProductAdminController } from './controllers/product.admin.controller';
import { CategoryModule } from '@modules/category/category.module';
import { CurrencyModule } from '@modules/currency/currency.module';
import { RebateModule } from '@modules/rebate/rebate.module';
import { ExpenseModule } from '@modules/expense/expense.module';

@Module({
    imports: [
        ProductRepositoryModule,
        CategoryModule,
        CurrencyModule,
        RebateModule,
        ExpenseModule,
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
