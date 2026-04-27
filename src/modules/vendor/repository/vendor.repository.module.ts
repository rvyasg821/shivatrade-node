import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { VendorEntity } from './entities/vendor.entity';
import { VendorContactEntity } from './entities/vendor-contact.entity';
import { VendorCategoryEntity } from './entities/vendor-category.entity';
import { VendorRepository } from './repositories/vendor.repository';
import { VendorContactRepository } from './repositories/vendor-contact.repository';
import { VendorCategoryRepository } from './repositories/vendor-category.repository';

@Module({
    providers: [VendorRepository, VendorContactRepository, VendorCategoryRepository],
    exports: [VendorRepository, VendorContactRepository, VendorCategoryRepository],
    imports: [
        TypeOrmModule.forFeature(
            [VendorEntity, VendorContactEntity, VendorCategoryEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class VendorRepositoryModule {}
