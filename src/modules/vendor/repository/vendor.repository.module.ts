import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { VendorEntity } from './entities/vendor.entity';
import { VendorContactEntity } from './entities/vendor-contact.entity';
import { VendorCategoryEntity } from './entities/vendor-category.entity';
import { VendorAddressEntity } from './entities/vendor-address.entity';
import { VendorBankAccountEntity } from './entities/vendor-bank-account.entity';
import { VendorRepository } from './repositories/vendor.repository';
import { VendorContactRepository } from './repositories/vendor-contact.repository';
import { VendorCategoryRepository } from './repositories/vendor-category.repository';
import { VendorAddressRepository } from './repositories/vendor-address.repository';
import { VendorBankAccountRepository } from './repositories/vendor-bank-account.repository';

@Module({
    providers: [
        VendorRepository,
        VendorContactRepository,
        VendorCategoryRepository,
        VendorAddressRepository,
        VendorBankAccountRepository,
    ],
    exports: [
        VendorRepository,
        VendorContactRepository,
        VendorCategoryRepository,
        VendorAddressRepository,
        VendorBankAccountRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [
                VendorEntity,
                VendorContactEntity,
                VendorCategoryEntity,
                VendorAddressEntity,
                VendorBankAccountEntity,
            ],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class VendorRepositoryModule {}
