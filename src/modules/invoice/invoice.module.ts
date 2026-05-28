import { Module } from '@nestjs/common';
import { InvoiceRepositoryModule } from './repository/invoice.repository.module';
import { InvoiceService } from './services/invoice.service';
import { InvoicePdfService } from './services/invoice-pdf.service';
import { InvoiceAdminController } from './controllers/invoice.admin.controller';
import { VoucherModule } from '@common/voucher/voucher.module';
import { PdfModule } from '@common/pdf/pdf.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { CustomerRepositoryModule } from '@modules/customer/repository/customer.repository.module';
import { ProductRepositoryModule } from '@modules/product/repository/product.repository.module';
import { ShippingRepositoryModule } from '@modules/shipping/repository/shipping.repository.module';
import { PoVendorRepositoryModule } from '@modules/po-vendor/repository/po-vendor.repository.module';
import { PurchaseOrderRepositoryModule } from '@modules/purchase-order/repository/purchase-order.repository.module';

/**
 * Phase 1 - Export Commercial Invoice.
 *
 * Imports `CompanyRepositoryModule` so the service can auto-snapshot
 * company GST / PAN / IEC / AD code / voucher_prefix into each invoice.
 * Imports `CustomerRepositoryModule` + `PdfModule` for PDF rendering
 * (Commercial Invoice + Packing List).
 */
@Module({
    imports: [
        InvoiceRepositoryModule,
        VoucherModule,
        PdfModule,
        CompanyRepositoryModule,
        CustomerRepositoryModule,
        ProductRepositoryModule,
        ShippingRepositoryModule,
        PoVendorRepositoryModule,
        PurchaseOrderRepositoryModule,
    ],
    providers: [InvoiceService, InvoicePdfService],
    exports: [InvoiceRepositoryModule, InvoiceService, InvoicePdfService],
    controllers: [InvoiceAdminController],
})
export class InvoiceModule {}
