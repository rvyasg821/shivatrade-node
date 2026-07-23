import { Module } from '@nestjs/common';
import { QuotationRepositoryModule } from '@modules/quotation/repository/quotation.repository.module';
import { PurchaseOrderRepositoryModule } from '@modules/purchase-order/repository/purchase-order.repository.module';
import { PoVendorRepositoryModule } from '@modules/po-vendor/repository/po-vendor.repository.module';
import { GrnRepositoryModule } from '@modules/grn/repository/grn.repository.module';
import { InvoiceRepositoryModule } from '@modules/invoice/repository/invoice.repository.module';
import { LeadRepositoryModule } from '@modules/lead/repository/lead.repository.module';
import { RfqRepositoryModule } from '@modules/rfq/repository/rfq.repository.module';
import { HsnPropagationService } from './hsn-propagation.service';

@Module({
    imports: [
        QuotationRepositoryModule,
        PurchaseOrderRepositoryModule,
        PoVendorRepositoryModule,
        GrnRepositoryModule,
        InvoiceRepositoryModule,
        LeadRepositoryModule,
        RfqRepositoryModule,
    ],
    providers: [HsnPropagationService],
    exports: [HsnPropagationService],
})
export class HsnPropagationModule {}
