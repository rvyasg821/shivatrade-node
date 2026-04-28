import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { CurrencyEntity } from './entities/currency.entity';
import { CurrencyExchangeRateEntity } from './entities/currency-exchange-rate.entity';
import { CurrencyRepository } from './repositories/currency.repository';
import { CurrencyExchangeRateRepository } from './repositories/currency-exchange-rate.repository';

@Module({
    providers: [CurrencyRepository, CurrencyExchangeRateRepository],
    exports: [CurrencyRepository, CurrencyExchangeRateRepository],
    imports: [
        TypeOrmModule.forFeature(
            [CurrencyEntity, CurrencyExchangeRateEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class CurrencyRepositoryModule {}
