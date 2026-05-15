import { Module } from '@nestjs/common';
import { CurrencyRepositoryModule } from './repository/currency.repository.module';
import { CurrencyService } from './services/currency.service';
import { CurrencyAdminController } from './controllers/currency.admin.controller';

@Module({
    imports: [CurrencyRepositoryModule],
    providers: [CurrencyService],
    exports: [CurrencyRepositoryModule, CurrencyService],
    controllers: [CurrencyAdminController],
})
export class CurrencyModule {}
