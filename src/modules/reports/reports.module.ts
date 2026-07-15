import { Module } from '@nestjs/common';
import { ReportsService } from './services/reports.service';
import { ReportsAdminController } from './controllers/reports.admin.controller';

/**
 * Aggregation reports (PRODUCT_PROFITABILITY_REPORT_PLAN.md and the four
 * follow-up report docs). Read-only: every query runs through the shared
 * DataSource — no repositories, no write paths. Additive; touches nothing else.
 */
@Module({
    providers: [ReportsService],
    controllers: [ReportsAdminController],
    exports: [ReportsService],
})
export class ReportsModule {}
