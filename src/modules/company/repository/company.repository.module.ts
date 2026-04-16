import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { CompanyEntity } from '@modules/company/repository/entities/company.entity';
import { CompanyRepository } from '@modules/company/repository/repositories/company.repository';

@Module({
    providers: [CompanyRepository],
    exports: [CompanyRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [CompanyEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class CompanyRepositoryModule { }
