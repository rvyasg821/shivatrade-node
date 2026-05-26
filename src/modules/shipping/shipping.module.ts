import { Module } from '@nestjs/common';
import { ShippingRepositoryModule } from './repository/shipping.repository.module';
import { ShippingService } from './services/shipping.service';
import { ShippingAdminController } from './controllers/shipping.admin.controller';
import { VoucherModule } from '@common/voucher/voucher.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { InvoiceRepositoryModule } from '@modules/invoice/repository/invoice.repository.module';

/**
 * Phase 1 - Export Shipping module.
 *
 * Imports `InvoiceRepositoryModule` to write back `shipping_id` on attached
 * invoices when invoices are linked / unlinked.
 */
@Module({
    imports: [
        ShippingRepositoryModule,
        VoucherModule,
        CompanyRepositoryModule,
        InvoiceRepositoryModule,
    ],
    providers: [ShippingService],
    exports: [ShippingRepositoryModule, ShippingService],
    controllers: [ShippingAdminController],
})
export class ShippingModule {}
