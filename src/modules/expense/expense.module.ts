import { Module } from '@nestjs/common';
import { ExpenseRepositoryModule } from './repository/expense.repository.module';
import { ExpenseService } from './services/expense.service';
import { ExpenseImportExportService } from './services/expense.import-export.service';
import { ExpenseAdminController } from './controllers/expense.admin.controller';
import { TrackingModule } from '@modules/tracking/tracking.module';

@Module({
    imports: [ExpenseRepositoryModule, TrackingModule],
    providers: [ExpenseService, ExpenseImportExportService],
    exports: [ExpenseRepositoryModule, ExpenseService, ExpenseImportExportService],
    controllers: [ExpenseAdminController],
})
export class ExpenseModule {}
