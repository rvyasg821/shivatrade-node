import { Module } from '@nestjs/common';
import { RebateRepositoryModule } from './repository/rebate.repository.module';
import { RebateService } from './services/rebate.service';
import { RebateAdminController } from './controllers/rebate.admin.controller';

@Module({
    imports: [RebateRepositoryModule],
    providers: [RebateService],
    exports: [RebateRepositoryModule, RebateService],
    controllers: [RebateAdminController],
})
export class RebateModule {}
