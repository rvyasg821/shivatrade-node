import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { CompanyEntity } from '@modules/company/repository/entities/company.entity';
import { CompanyAddressEntity } from '@modules/company/repository/entities/company-address.entity';
import { CompanyBankAccountEntity } from '@modules/company/repository/entities/company-bank-account.entity';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';
import { CompanyAddressRepository } from '@modules/company/repository/repositories/company-address.repository';
import { CompanyBankAccountRepository } from '@modules/company/repository/repositories/company-bank-account.repository';

@Module({
    providers: [
        CompanyRepository,
        CompanyAddressRepository,
        CompanyBankAccountRepository,
    ],
    exports: [
        CompanyRepository,
        CompanyAddressRepository,
        CompanyBankAccountRepository,
    ],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [CompanyEntity, CompanyAddressEntity, CompanyBankAccountEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class CompanyRepositoryModule { }
