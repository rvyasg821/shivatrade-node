import { Module } from '@nestjs/common';
import { InvoiceRepositoryModule } from '@modules/invoice/repository/invoice.repository.module';
import { PoVendorModule } from '@modules/po-vendor/po-vendor.module';
import { PoVendorRepositoryModule } from '@modules/po-vendor/repository/po-vendor.repository.module';
import { CustomerRepositoryModule } from '@modules/customer/repository/customer.repository.module';
import { VendorRepositoryModule } from '@modules/vendor/repository/vendor.repository.module';
import { AdjustmentNoteRepositoryModule } from '@modules/adjustment-note/repository/adjustment-note.repository.module';
import { LedgerService } from './services/ledger.service';
import { LedgerAdminController } from './controllers/ledger.admin.controller';

/**
 * Party ledgers (#9/#10) — read-only projection over invoices + receipts +
 * vendor POs + vendor payments + adjustment notes. FileService is global.
 */
@Module({
    imports: [
        InvoiceRepositoryModule,
        PoVendorModule,
        PoVendorRepositoryModule,
        CustomerRepositoryModule,
        VendorRepositoryModule,
        AdjustmentNoteRepositoryModule,
    ],
    providers: [LedgerService],
    controllers: [LedgerAdminController],
    exports: [LedgerService],
})
export class LedgerModule {}
