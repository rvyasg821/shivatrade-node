import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { CustomerEntity } from './entities/customer.entity';
import { CustomerContactEntity } from './entities/customer-contact.entity';
import { CustomerRepository } from './repositories/customer.repository';
import { CustomerContactRepository } from './repositories/customer-contact.repository';

@Module({
    providers: [CustomerRepository, CustomerContactRepository],
    exports: [CustomerRepository, CustomerContactRepository],
    imports: [
        TypeOrmModule.forFeature(
            [CustomerEntity, CustomerContactEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class CustomerRepositoryModule {}
