import { Module } from '@nestjs/common';
import { ExpenseRepositoryModule } from './repository/expense.repository.module';
import { ExpenseService } from './services/expense.service';
import { ExpenseAdminController } from './controllers/expense.admin.controller';

@Module({
    imports: [ExpenseRepositoryModule],
    providers: [ExpenseService],
    exports: [ExpenseRepositoryModule, ExpenseService],
    controllers: [ExpenseAdminController],
})
export class ExpenseModule {}
