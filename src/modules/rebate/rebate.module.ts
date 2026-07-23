import { Module } from '@nestjs/common';
import { RebateRepositoryModule } from './repository/rebate.repository.module';
import { RebateService } from './services/rebate.service';
import { RebateImportExportService } from './services/rebate.import-export.service';
import { RebateAdminController } from './controllers/rebate.admin.controller';

@Module({
    imports: [RebateRepositoryModule],
    providers: [RebateService, RebateImportExportService],
    exports: [RebateRepositoryModule, RebateService, RebateImportExportService],
    controllers: [RebateAdminController],
})
export class RebateModule {}
