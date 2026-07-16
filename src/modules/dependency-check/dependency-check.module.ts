import { Module } from '@nestjs/common';
import { RfqRepositoryModule } from '@modules/rfq/repository/rfq.repository.module';
import { QuotationRepositoryModule } from '@modules/quotation/repository/quotation.repository.module';
import { PurchaseOrderRepositoryModule } from '@modules/purchase-order/repository/purchase-order.repository.module';
import { InvoiceRepositoryModule } from '@modules/invoice/repository/invoice.repository.module';
import { PoVendorRepositoryModule } from '@modules/po-vendor/repository/po-vendor.repository.module';
import { GrnRepositoryModule } from '@modules/grn/repository/grn.repository.module';
import { PriceListRepositoryModule } from '@modules/price-list/repository/price-list.repository.module';
import { LeadRepositoryModule } from '@modules/lead/repository/lead.repository.module';
import { AdjustmentNoteRepositoryModule } from '@modules/adjustment-note/repository/adjustment-note.repository.module';
import { DependencyCheckService } from './dependency-check.service';

@Module({
    imports: [
        RfqRepositoryModule,
        QuotationRepositoryModule,
        PurchaseOrderRepositoryModule,
        InvoiceRepositoryModule,
        PoVendorRepositoryModule,
        GrnRepositoryModule,
        PriceListRepositoryModule,
        LeadRepositoryModule,
        AdjustmentNoteRepositoryModule,
    ],
    providers: [DependencyCheckService],
    exports: [DependencyCheckService],
})
export class DependencyCheckModule {}
