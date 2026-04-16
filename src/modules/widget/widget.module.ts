import { Module, forwardRef } from '@nestjs/common';
import { WidgetRepositoryModule } from './repository/widget.repository.module';
import { WidgetService } from './services/widget.service';
import { WidgetProvisioningService } from './services/widget-provisioning.service';
import { WidgetCacheService } from './services/widget-cache.service';
import { WidgetSharedController } from './controllers/widget.shared.controller';
import { UserModule } from '@modules/user/user.module';
import { AuthModule } from '@modules/auth/auth.module';
import { ToolsModule } from '@modules/tools/tools.module';
import { CompanyModule } from '@modules/company/company.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';

@Module({
    imports: [
        WidgetRepositoryModule,
        forwardRef(() => UserModule),
        forwardRef(() => AuthModule),
        forwardRef(() => ToolsModule),
        forwardRef(() => CompanyModule),
        forwardRef(() => SubscriptionModule),
    ],
    exports: [WidgetService, WidgetProvisioningService, WidgetCacheService],
    providers: [
        WidgetService,
        WidgetProvisioningService,
        WidgetCacheService,
    ],
    controllers: [],
})
export class WidgetModule { }