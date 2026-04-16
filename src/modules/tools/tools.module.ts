import { PaginationModule } from '@common/pagination/pagination.module';
import { AuthModule } from '@modules/auth/auth.module';
import { ToolsAdminController } from '@modules/tools/controllers/tools.admin.controller';
import { ToolsExistsPipe } from '@modules/tools/pipes/tools.exists.pipe';
import { ToolsParsePipe } from '@modules/tools/pipes/tools.parse.pipe';
import { ToolsStatusPipe } from '@modules/tools/pipes/tools.status.pipe';
import { ToolsRepositoryModule } from '@modules/tools/repository/tools.repository.module';
import { ToolsService } from '@modules/tools/services/tools.service';
import { RoleModule } from '@modules/role/role.module';
import { UserModule } from '@modules/user/user.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { ToolAccessHelper } from '@modules/tools/helpers/tool-access.helper';
import { ToolAccessGuard } from '@modules/tools/guards/tool-access.guard';
import { CacheModule } from '@nestjs/cache-manager';
import { Module, forwardRef } from '@nestjs/common';
import { ToolDeletionModule } from './tool-deletion.module';

@Module({
    imports: [
        ToolsRepositoryModule,
        PaginationModule,
        CacheModule.register(),
        forwardRef(() => RoleModule),
        forwardRef(() => UserModule),
        forwardRef(() => AuthModule),
        forwardRef(() => SubscriptionModule),
        ToolDeletionModule,
    ],
    exports: [ToolsService, ToolAccessHelper, ToolAccessGuard],
    providers: [
        ToolsService,
        ToolAccessHelper,
        ToolAccessGuard,
        ToolsParsePipe,
        ToolsExistsPipe,
        ToolsStatusPipe,
    ],
    controllers: [ToolsAdminController],
})
export class ToolsModule { }