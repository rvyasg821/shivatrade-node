import { PaginationModule } from '@common/pagination/pagination.module';
import { AuthModule } from '@modules/auth/auth.module';
import { RoleModule } from '@modules/role/role.module';
import { PlanModule } from '@modules/plan/plan.module';
import { ToolsModule } from '@modules/tools/tools.module';
import { CompanyModule } from '@modules/company/company.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { DiscountModule } from '@modules/discount/discount.module';
import { HelperModule } from '@common/helper/helper.module';
import { EmailModule } from '@modules/email/email.module';
import { LocationModule } from '@modules/location/location.module';

import { ToolAccessGuard } from '@modules/subscription/guards/tool-access.guard';
import { SubscriptionExistsPipe } from '@modules/subscription/pipes/subscription.exists.pipe';
import { SubscriptionParsePipe } from '@modules/subscription/pipes/subscription.parse.pipe';
import { SubscriptionRepositoryModule } from '@modules/subscription/repository/subscription.repository.module';
import { SubscriptionCacheService } from '@modules/subscription/services/subscription.cache.service';
import { SubscriptionLoggerService } from '@modules/subscription/services/subscription.logger.service';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import { SubscriptionCleanupService } from '@modules/subscription/services/subscription-cleanup.service';
import { ToolProvisioningService } from '@modules/subscription/services/tool-provisioning.service';
import { InvoiceService } from '@modules/subscription/services/invoice.service';
import { SubscriptionInvoiceHelper } from '@modules/subscription/services/subscription-invoice.helper';
import { SubscriptionToolLoggerModule } from '@common/logger/subscription-tool-logger.module';
import { SubscriptionDiagnosticsAdminController } from '@modules/subscription/controllers/subscription-diagnostics.admin.controller';
import { SubscriptionAdminController } from '@modules/subscription/controllers/subscription.admin.controller';
import { SubscriptionPublicController } from '@modules/subscription/controllers/subscription.public.controller';
import { UserModule } from '@modules/user/user.module';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { Module, forwardRef } from '@nestjs/common';

// ToolProvisioningService dependencies - Removed tenant services

@Module({
    imports: [
        ConfigModule,
        SubscriptionRepositoryModule,
        PaginationModule,
        CacheModule.register(),
        forwardRef(() => RoleModule),
        forwardRef(() => UserModule),
        UserRepositoryModule,
        forwardRef(() => AuthModule),
        forwardRef(() => PlanModule),
        ToolsModule,
        forwardRef(() => CompanyModule),
        CompanyRepositoryModule,
        forwardRef(() => LocationModule),
        SubscriptionToolLoggerModule,
        forwardRef(() => DiscountModule),
        HelperModule,
        forwardRef(() => EmailModule),
    ],
    exports: [
        SubscriptionService,
        SubscriptionCacheService,
        SubscriptionLoggerService,
        SubscriptionCleanupService,
        ToolAccessGuard,
        ToolProvisioningService,
        InvoiceService,
        SubscriptionInvoiceHelper,
    ],
    providers: [
        SubscriptionService,
        SubscriptionCacheService,
        SubscriptionLoggerService,
        SubscriptionCleanupService,
        SubscriptionParsePipe,
        SubscriptionExistsPipe,
        ToolAccessGuard,
        ToolProvisioningService,
        InvoiceService,
        SubscriptionInvoiceHelper,
    ],
    controllers: [
        SubscriptionPublicController,  // Public routes MUST come first to avoid wildcard conflicts
        SubscriptionAdminController,
        SubscriptionDiagnosticsAdminController,
    ],

})
export class SubscriptionModule { }