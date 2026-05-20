import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { PoVendorEntity } from './entities/po-vendor.entity';
import { PoVendorLineEntity } from './entities/po-vendor-line.entity';
import { PoVendorRepository } from './repositories/po-vendor.repository';
import { PoVendorLineRepository } from './repositories/po-vendor-line.repository';

@Module({
    providers: [PoVendorRepository, PoVendorLineRepository],
    exports: [PoVendorRepository, PoVendorLineRepository],
    imports: [
        TypeOrmModule.forFeature(
            [PoVendorEntity, PoVendorLineEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class PoVendorRepositoryModule {}
