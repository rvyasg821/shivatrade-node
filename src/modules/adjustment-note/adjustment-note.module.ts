import { Module } from '@nestjs/common';
import { CompanyModule } from '@modules/company/company.module';
import { CustomerRepositoryModule } from '@modules/customer/repository/customer.repository.module';
import { VendorRepositoryModule } from '@modules/vendor/repository/vendor.repository.module';
import { VoucherModule } from '@common/voucher/voucher.module';
import { InvoiceModule } from '@modules/invoice/invoice.module';
import { PoVendorModule } from '@modules/po-vendor/po-vendor.module';
import { AdjustmentNoteRepositoryModule } from './repository/adjustment-note.repository.module';
import { AdjustmentNoteService } from './services/adjustment-note.service';
import { AdjustmentNoteAdminController } from './controllers/adjustment-note.admin.controller';

/**
 * Adjustment Notes (client #8) — off-document customer/vendor debit/credit.
 * The Ledger module (#9/#10) reads AdjustmentNoteRepository via the exported
 * repository module.
 */
@Module({
    imports: [
        AdjustmentNoteRepositoryModule,
        CustomerRepositoryModule,
        VendorRepositoryModule,
        CompanyModule,
        VoucherModule,
        // A note may be applied to an Invoice / Vendor PO — we validate the
        // link and re-derive that document's balance. Both modules import only
        // AdjustmentNoteRepositoryModule back, so there is no cycle.
        InvoiceModule,
        PoVendorModule,
    ],
    providers: [AdjustmentNoteService],
    controllers: [AdjustmentNoteAdminController],
    exports: [AdjustmentNoteService, AdjustmentNoteRepositoryModule],
})
export class AdjustmentNoteModule {}
