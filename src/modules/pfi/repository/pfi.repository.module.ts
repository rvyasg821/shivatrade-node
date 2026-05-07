import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { PfiEntity } from './entities/pfi.entity';
import { PfiLineEntity } from './entities/pfi-line.entity';
import { PfiExpenseEntity } from './entities/pfi-expense.entity';
import { PfiRebateEntity } from './entities/pfi-rebate.entity';
import { PfiRepository } from './repositories/pfi.repository';
import { PfiLineRepository } from './repositories/pfi-line.repository';
import { PfiExpenseRepository } from './repositories/pfi-expense.repository';
import { PfiRebateRepository } from './repositories/pfi-rebate.repository';

@Module({
    providers: [
        PfiRepository,
        PfiLineRepository,
        PfiExpenseRepository,
        PfiRebateRepository,
    ],
    exports: [
        PfiRepository,
        PfiLineRepository,
        PfiExpenseRepository,
        PfiRebateRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [PfiEntity, PfiLineEntity, PfiExpenseEntity, PfiRebateEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class PfiRepositoryModule {}
