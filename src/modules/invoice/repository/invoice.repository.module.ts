import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { InvoiceEntity } from './entities/invoice.entity';
import { InvoiceLineEntity } from './entities/invoice-line.entity';
import { InvoiceRepository } from './repositories/invoice.repository';
import { InvoiceLineRepository } from './repositories/invoice-line.repository';

@Module({
    providers: [InvoiceRepository, InvoiceLineRepository],
    exports: [InvoiceRepository, InvoiceLineRepository],
    imports: [
        TypeOrmModule.forFeature(
            [InvoiceEntity, InvoiceLineEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class InvoiceRepositoryModule {}
