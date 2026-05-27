import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { ShippingEntity } from './entities/shipping.entity';
import { ShippingEventEntity } from './entities/shipping-event.entity';
import { ShippingInvoiceEntity } from './entities/shipping-invoice.entity';
import { ShippingRepository } from './repositories/shipping.repository';
import { ShippingEventRepository } from './repositories/shipping-event.repository';
import { ShippingInvoiceRepository } from './repositories/shipping-invoice.repository';

@Module({
    providers: [
        ShippingRepository,
        ShippingEventRepository,
        ShippingInvoiceRepository,
    ],
    exports: [
        ShippingRepository,
        ShippingEventRepository,
        ShippingInvoiceRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [ShippingEntity, ShippingEventEntity, ShippingInvoiceEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class ShippingRepositoryModule {}
