import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { QuotationEntity } from './entities/quotation.entity';
import { QuotationLineEntity } from './entities/quotation-line.entity';
import { QuotationExpenseEntity } from './entities/quotation-expense.entity';
import { QuotationRebateEntity } from './entities/quotation-rebate.entity';
import { QuotationRepository } from './repositories/quotation.repository';
import { QuotationLineRepository } from './repositories/quotation-line.repository';
import { QuotationExpenseRepository } from './repositories/quotation-expense.repository';
import { QuotationRebateRepository } from './repositories/quotation-rebate.repository';

@Module({
    providers: [
        QuotationRepository,
        QuotationLineRepository,
        QuotationExpenseRepository,
        QuotationRebateRepository,
    ],
    exports: [
        QuotationRepository,
        QuotationLineRepository,
        QuotationExpenseRepository,
        QuotationRebateRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [
                QuotationEntity,
                QuotationLineEntity,
                QuotationExpenseEntity,
                QuotationRebateEntity,
            ],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class QuotationRepositoryModule {}
