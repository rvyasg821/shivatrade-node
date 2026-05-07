import { Global, Module } from '@nestjs/common';
import { VoucherRepositoryModule } from './repository/voucher.repository.module';
import { VoucherService } from './services/voucher.service';

/**
 * Global so any module (Quotation, PFI, PO, future Invoice/GRN/POV) can
 * inject `VoucherService` without re-importing.
 */
@Global()
@Module({
    imports: [VoucherRepositoryModule],
    providers: [VoucherService],
    exports: [VoucherService, VoucherRepositoryModule],
})
export class VoucherModule {}
