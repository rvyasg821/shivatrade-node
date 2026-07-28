import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { VendorCategoryMasterEntity } from './entities/vendor-category.entity';
import { VendorCategoryMasterRepository } from './repositories/vendor-category.repository';

@Module({
    providers: [VendorCategoryMasterRepository],
    exports: [VendorCategoryMasterRepository],
    imports: [
        TypeOrmModule.forFeature(
            [VendorCategoryMasterEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class VendorCategoryRepositoryModule {}
