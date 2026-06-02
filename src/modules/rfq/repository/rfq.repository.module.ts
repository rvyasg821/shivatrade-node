import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { RfqEntity } from './entities/rfq.entity';
import { RfqLineEntity } from './entities/rfq-line.entity';
import { RfqVendorEntity } from './entities/rfq-vendor.entity';
import { RfqVendorPriceEntity } from './entities/rfq-vendor-price.entity';
import { RfqRepository } from './repositories/rfq.repository';
import { RfqLineRepository } from './repositories/rfq-line.repository';
import { RfqVendorRepository } from './repositories/rfq-vendor.repository';
import { RfqVendorPriceRepository } from './repositories/rfq-vendor-price.repository';

@Module({
    providers: [
        RfqRepository,
        RfqLineRepository,
        RfqVendorRepository,
        RfqVendorPriceRepository,
    ],
    exports: [
        RfqRepository,
        RfqLineRepository,
        RfqVendorRepository,
        RfqVendorPriceRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [
                RfqEntity,
                RfqLineEntity,
                RfqVendorEntity,
                RfqVendorPriceEntity,
            ],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class RfqRepositoryModule {}
