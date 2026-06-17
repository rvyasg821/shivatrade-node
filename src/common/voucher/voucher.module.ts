import { Global, Module } from '@nestjs/common';
import { VoucherRepositoryModule } from './repository/voucher.repository.module';
import { VoucherService } from './services/voucher.service';
import { CompanySettingsRepositoryModule } from '@modules/company-settings/repository/company-settings.repository.module';

/**
 * Global so any module (Quotation, PFI, PO, future Invoice/GRN/POV) can
 * inject `VoucherService` without re-importing.
 */
@Global()
@Module({
    imports: [VoucherRepositoryModule, CompanySettingsRepositoryModule],
    providers: [VoucherService],
    exports: [VoucherService, VoucherRepositoryModule],
})
export class VoucherModule {}
