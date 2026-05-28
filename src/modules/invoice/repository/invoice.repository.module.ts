import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { InvoiceEntity } from './entities/invoice.entity';
import { InvoiceLineEntity } from './entities/invoice-line.entity';
import { InvoicePaymentEntity } from './entities/invoice-payment.entity';
import { InvoiceRepository } from './repositories/invoice.repository';
import { InvoiceLineRepository } from './repositories/invoice-line.repository';
import { InvoicePaymentRepository } from './repositories/invoice-payment.repository';

@Module({
    providers: [
        InvoiceRepository,
        InvoiceLineRepository,
        InvoicePaymentRepository,
    ],
    exports: [
        InvoiceRepository,
        InvoiceLineRepository,
        InvoicePaymentRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [InvoiceEntity, InvoiceLineEntity, InvoicePaymentEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class InvoiceRepositoryModule {}
