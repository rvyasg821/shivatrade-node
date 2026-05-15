import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { CustomerEntity } from './entities/customer.entity';
import { CustomerContactEntity } from './entities/customer-contact.entity';
import { CustomerAddressEntity } from './entities/customer-address.entity';
import { CustomerRepository } from './repositories/customer.repository';
import { CustomerContactRepository } from './repositories/customer-contact.repository';
import { CustomerAddressRepository } from './repositories/customer-address.repository';

@Module({
    providers: [CustomerRepository, CustomerContactRepository, CustomerAddressRepository],
    exports: [CustomerRepository, CustomerContactRepository, CustomerAddressRepository],
    imports: [
        TypeOrmModule.forFeature(
            [CustomerEntity, CustomerContactEntity, CustomerAddressEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class CustomerRepositoryModule {}
