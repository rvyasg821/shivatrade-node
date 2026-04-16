import { forwardRef, Module } from '@nestjs/common';
import { ToolDeletionQueueModule } from './queues/tool-deletion.queue.module';
import { ToolDeletionProcessor } from './processors/tool-deletion.processor';
import { ToolDeletionService } from './services/tool-deletion.service';
// import { CascadeOperationsService } from './services/cascade-operations.service';
import { PricingRecalculationService } from './services/pricing-recalculation.service';
// import { ToolDeletionAdminController } from './controllers/tool-deletion.admin.controller';
import { ToolsRepositoryModule } from './repository/tools.repository.module';
import { PlanRepositoryModule } from '@modules/plan/repository/plan.repository.module';
import { SubscriptionRepositoryModule } from '@modules/subscription/repository/subscription.repository.module';
import { WidgetRepositoryModule } from '@modules/widget/repository/widget.repository.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { RoleModule } from '@modules/role/role.module';
import { ToolsModule } from './tools.module';

@Module({
    imports: [
        ToolDeletionQueueModule,
        ToolsRepositoryModule,
        PlanRepositoryModule,
        SubscriptionRepositoryModule,
        WidgetRepositoryModule,
        CompanyRepositoryModule,
        forwardRef(() => RoleModule),// forwardRef(() => ToolsModule),
        // forwardRef(() => ToolsRepositoryModule),
    ],
    controllers: [],
    providers: [
        ToolDeletionProcessor,
        ToolDeletionService,
        // CascadeOperationsService, // DISABLED: Tenant code cleanup
        PricingRecalculationService,
    ],
    exports: [
        ToolDeletionService,
        // CascadeOperationsService, // DISABLED: Tenant code cleanup
        PricingRecalculationService,
    ],
})
export class ToolDeletionModule {
    constructor(private readonly processor: ToolDeletionProcessor) {}
}
