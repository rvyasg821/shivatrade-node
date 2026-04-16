import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlanRepositoryModule } from '@modules/plan/repository/plan.repository.module';
import { PlanService } from '@modules/plan/services/plan.service';
import { PlanAdminController } from '@modules/plan/controllers/plan.admin.controller';
import { PlanSharedController } from '@modules/plan/controllers/plan.shared.controller';
import { PlanPublicController } from '@modules/plan/controllers/plan.public.controller';
import { PlanParsePipe } from '@modules/plan/pipes/plan.parse.pipe';
import { PlanExistsPipe } from '@modules/plan/pipes/plan.exists.pipe';
import { PlanStatusPipe } from '@modules/plan/pipes/plan.status.pipe';
import { PaginationModule } from '@common/pagination/pagination.module';
import { CacheModule } from '@nestjs/cache-manager';
import { UserModule } from '@modules/user/user.module';
import { AuthModule } from '@modules/auth/auth.module';
import { RoleModule } from '@modules/role/role.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { ToolsModule } from '@modules/tools/tools.module';

@Module({
    imports: [
        ConfigModule,
        PlanRepositoryModule,
        PaginationModule,
        CacheModule.register(),
        forwardRef(() => RoleModule),
        forwardRef(() => UserModule),
        forwardRef(() => SubscriptionModule),
        forwardRef(() => AuthModule),ToolsModule,
    ],
    exports: [PlanService],
    providers: [
        PlanService,
        PlanParsePipe,
        PlanExistsPipe,
        PlanStatusPipe,
    ],
    controllers: [
        PlanAdminController,
        PlanSharedController,
        PlanPublicController,
    ],
})
export class PlanModule { }