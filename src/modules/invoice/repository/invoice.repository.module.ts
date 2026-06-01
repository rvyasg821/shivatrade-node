import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { InvoiceEntity } from './entities/invoice.entity';
import { InvoiceLineEntity } from './entities/invoice-line.entity';
import { InvoicePaymentEntity } from './entities/invoice-payment.entity';
import { InvoiceEventEntity } from './entities/invoice-event.entity';
import { InvoiceRepository } from './repositories/invoice.repository';
import { InvoiceLineRepository } from './repositories/invoice-line.repository';
import { InvoicePaymentRepository } from './repositories/invoice-payment.repository';
import { InvoiceEventRepository } from './repositories/invoice-event.repository';

@Module({
    providers: [
        InvoiceRepository,
        InvoiceLineRepository,
        InvoicePaymentRepository,
        InvoiceEventRepository,
    ],
    exports: [
        InvoiceRepository,
        InvoiceLineRepository,
        InvoicePaymentRepository,
        InvoiceEventRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [
                InvoiceEntity,
                InvoiceLineEntity,
                InvoicePaymentEntity,
                InvoiceEventEntity,
            ],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class InvoiceRepositoryModule {}
