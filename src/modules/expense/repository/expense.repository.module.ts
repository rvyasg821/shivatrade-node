import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { ExpenseEntity } from './entities/expense.entity';
import { ExpenseRepository } from './repositories/expense.repository';

@Module({
    providers: [ExpenseRepository],
    exports: [ExpenseRepository],
    imports: [
        TypeOrmModule.forFeature([ExpenseEntity], DATABASE_CONNECTION_NAME),
    ],
})
export class ExpenseRepositoryModule {}
