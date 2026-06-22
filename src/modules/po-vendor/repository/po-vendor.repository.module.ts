import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { PoVendorEntity } from './entities/po-vendor.entity';
import { PoVendorLineEntity } from './entities/po-vendor-line.entity';
import { PoVendorPaymentEntity } from './entities/po-vendor-payment.entity';
import { PoVendorRepository } from './repositories/po-vendor.repository';
import { PoVendorLineRepository } from './repositories/po-vendor-line.repository';
import { PoVendorPaymentRepository } from './repositories/po-vendor-payment.repository';

@Module({
    providers: [
        PoVendorRepository,
        PoVendorLineRepository,
        PoVendorPaymentRepository,
    ],
    exports: [
        PoVendorRepository,
        PoVendorLineRepository,
        PoVendorPaymentRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [PoVendorEntity, PoVendorLineEntity, PoVendorPaymentEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class PoVendorRepositoryModule {}
