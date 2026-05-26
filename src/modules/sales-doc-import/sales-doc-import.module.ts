import { Module } from '@nestjs/common';

import { ProductModule } from '@modules/product/product.module';
import { VendorModule } from '@modules/vendor/vendor.module';
import { RebateModule } from '@modules/rebate/rebate.module';
import { ExpenseModule } from '@modules/expense/expense.module';
import { PriceListModule } from '@modules/price-list/price-list.module';

import { SalesDocImportAdminController } from './controllers/sales-doc-import.admin.controller';
import { SalesDocImportService } from './services/sales-doc-import.service';

// Shared module: line-item import/export for quotation, PFI, and PO.
// Has no entities of its own — purely wraps lookups against
// product / rebate / expense / vendor / price-list.
@Module({
    imports: [
        ProductModule,
        VendorModule,
        RebateModule,
        ExpenseModule,
        PriceListModule,
    ],
    providers: [SalesDocImportService],
    exports: [SalesDocImportService],
    controllers: [SalesDocImportAdminController],
})
export class SalesDocImportModule {}
