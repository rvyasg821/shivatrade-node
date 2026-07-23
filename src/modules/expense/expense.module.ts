import { Module } from '@nestjs/common';
import { ExpenseRepositoryModule } from './repository/expense.repository.module';
import { ExpenseService } from './services/expense.service';
import { ExpenseImportExportService } from './services/expense.import-export.service';
import { ExpenseAdminController } from './controllers/expense.admin.controller';

@Module({
    imports: [ExpenseRepositoryModule],
    providers: [ExpenseService, ExpenseImportExportService],
    exports: [ExpenseRepositoryModule, ExpenseService, ExpenseImportExportService],
    controllers: [ExpenseAdminController],
})
export class ExpenseModule {}
