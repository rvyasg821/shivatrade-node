import { Module } from '@nestjs/common';
import { PoVendorModule } from '@modules/po-vendor/po-vendor.module';
import { PoVendorRepositoryModule } from '@modules/po-vendor/repository/po-vendor.repository.module';
import { VendorRepositoryModule } from '@modules/vendor/repository/vendor.repository.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { InvoiceRepositoryModule } from '@modules/invoice/repository/invoice.repository.module';
import { CustomerRepositoryModule } from '@modules/customer/repository/customer.repository.module';
import { GrnRepositoryModule } from '@modules/grn/repository/grn.repository.module';
import { ReportsService } from './services/reports.service';
import { ReportsAdminController } from './controllers/reports.admin.controller';

/**
 * Aggregation reports (PRODUCT_PROFITABILITY_REPORT_PLAN.md and the follow-up
 * report docs). Read-only — no write paths.
 *
 * Profitability + HSN Summary run pure SQL through the shared DataSource. The
 * GST Balance report additionally needs `PoVendorService.mapList` (a POV's GST
 * is derived, not stored) plus vendor/company GSTIN + state to split CGST/SGST
 * from IGST — same reuse `LedgerModule` makes for `order_value`.
 */
@Module({
    imports: [
        PoVendorModule,
        PoVendorRepositoryModule,
        VendorRepositoryModule,
        CompanyRepositoryModule,
        // Sales Turnover — invoices + their receipts, and customer names.
        InvoiceRepositoryModule,
        CustomerRepositoryModule,
        // Purchase Turnover / GST Input — GRN (goods actually received), not
        // the PO/POV itself.
        GrnRepositoryModule,
    ],
    providers: [ReportsService],
    controllers: [ReportsAdminController],
    exports: [ReportsService],
})
export class ReportsModule {}
