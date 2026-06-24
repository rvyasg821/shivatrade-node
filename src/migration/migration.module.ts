import { forwardRef, Module } from '@nestjs/common';
import { CommandModule } from 'nestjs-command';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';

// Database
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { DatabaseOptionService } from '@common/database/services/database.options.service';
import { DatabaseOptionModule, DatabaseModule } from '@common/database/database.module';

// Helper modules
import { HelperModule } from '@common/helper/helper.module';
import { PaginationModule } from '@common/pagination/pagination.module';
import { MessageModule } from '@common/message/message.module';

// Seeds
import { MigrationRoleSeed } from '@migration/seeds/migration.role.seed';
import { MigrationRoleCategorySeed } from '@migration/seeds/migration.role-category.seed';
import { MigrationFixAdminPermissionsSeed } from '@migration/seeds/migration.fix-admin-permissions.seed';
import { MigrationTemplateSeed } from '@migration/seeds/migration.template.seed';
import { MigrationUserSeed } from '@migration/seeds/migration.user.seed';
import { MigrationSettingFeatureSeed } from '@migration/seeds/migration.settings.seed';
import { MigrationUpdateRolePermissionsSeed } from '@migration/seeds/migration.update-role-permissions.seed';
import { MigrationPlanLocationPricingSeed } from '@migration/seeds/migration.plan-location-pricing.seed';
import { MigrationPlanPricingSimplifySeed } from '@migration/seeds/migration.plan-pricing-simplify.seed';
import { MigrationPlanStructureCleanupSeed } from '@migration/seeds/migration.plan-structure-cleanup.seed';
import { MigrationToolsDisplayOrderSeed } from '@migration/seeds/migration.tools-display-order.seed';
import { MigrationToolsSetDisplayOrderSeed } from '@migration/seeds/migration.tools-set-display-order.seed';
import { MigrationFreshInitSeed } from '@migration/seeds/migration.fresh-init.seed';
import { MigrationToolsSeed } from '@migration/seeds/migration.tools.seed';
import { MigrationHrmPlansSeed } from '@migration/seeds/migration.hrm-plans.seed';
import { MigrationLeaveTypesSeed } from '@migration/seeds/migration.leave-types.seed';
import { MigrationDocumentCategoriesSeed } from '@migration/seeds/migration.document-categories.seed';
import { MigrationSyncCustomRolePermissionsSeed } from '@migration/seeds/migration.sync-custom-role-permissions.seed';
import { MigrationContractTemplatesSeed } from '@migration/seeds/migration.contract-templates.seed';
import { MigrationNotificationEventsSeed } from '@migration/seeds/migration.notification-events.seed';
import { MigrationProductionSeed } from '@migration/seeds/migration.production.seed';
import { MigrationTradeDataSeed } from '@migration/seeds/migration.trade-data.seed';
import { MigrationPortMasterSeed } from '@migration/seeds/migration.port-master.seed';
import { MigrationShivatradeTenantSeed } from '@migration/seeds/migration.shivatrade-tenant.seed';
import { MigrationCatalogSeed } from '@migration/seeds/migration.catalog.seed';
import { MigrationStockBackfillSeed } from '@migration/seeds/migration.stock-backfill.seed';
import { GrnRepositoryModule } from '@modules/grn/repository/grn.repository.module';
import { PoVendorRepositoryModule } from '@modules/po-vendor/repository/po-vendor.repository.module';
import { InventoryRepositoryModule } from '@modules/inventory/repository/inventory.repository.module';
import { CategoryRepositoryModule } from '@modules/category/repository/category.repository.module';
import { ProductRepositoryModule } from '@modules/product/repository/product.repository.module';
import { VendorRepositoryModule } from '@modules/vendor/repository/vendor.repository.module';
import { RebateRepositoryModule } from '@modules/rebate/repository/rebate.repository.module';
import { ExpenseRepositoryModule } from '@modules/expense/repository/expense.repository.module';
import { PortMasterModule } from '@modules/port-master/port-master.module';

// Repository modules (no controllers)
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';
import { RoleModule } from '@modules/role/role.module';
import { UserModule } from '@modules/user/user.module';
import { RoleRepositoryModule } from '@modules/role/repository/role.repository.module';
import { PasswordHistoryRepositoryModule } from '@modules/password-history/repository/password-history.repository.module';
import { SessionRepositoryModule } from '@modules/session/repository/session.repository.module';
import { ActivityRepositoryModule } from '@modules/activity/repository/activity.repository.module';
import { SettingRepositoryModule } from '@modules/setting/repository/setting.repository.module';
import { ToolsRepositoryModule } from '@modules/tools/repository/tools.repository.module';
import { PlanRepositoryModule } from '@modules/plan/repository/plan.repository.module';
import { LeaveRepositoryModule } from '@modules/leave/repository/leave.repository.module';
import { DocumentRepositoryModule } from '@modules/document/repository/document.repository.module';
import { ContractRepositoryModule } from '@modules/contract/repository/contract.repository.module';
import { NotificationRepositoryModule } from '@modules/notification/repository/notification.repository.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { LocationRepositoryModule } from '@modules/location/repository/location.repository.module';

// Services (directly imported to avoid controller dependencies)
import { UserService } from '@modules/user/services/user.service';
import { RoleService } from '@modules/role/services/role.service';
import { PasswordHistoryService } from '@modules/password-history/services/password-history.service';
import { SessionService } from '@modules/session/services/session.service';
import { ActivityService } from '@modules/activity/services/activity.service';
import { SettingService } from '@modules/setting/services/setting.service';
import { ToolsService } from '@modules/tools/services/tools.service';
import { PlanService } from '@modules/plan/services/plan.service';

// Email module (needed for templates)
import { EmailModule } from '@modules/email/email.module';

// Config
import configs from '@config';
// Commands
import { MigrateToolsWidgetsSettingsCommand } from './commands/migrate-tools-widgets-settings.command';
import { ToolDeletionModule } from '@modules/tools/tool-deletion.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            load: configs,
            isGlobal: true,
            cache: true,
            envFilePath: ['.env'],
            expandVariables: false,
        }),
        TypeOrmModule.forRootAsync({
            name: DATABASE_CONNECTION_NAME,
            imports: [DatabaseOptionModule],
            inject: [DatabaseOptionService],
            useFactory: (databaseService: DatabaseOptionService) =>
                databaseService.createOptions(),
        }),
        CacheModule.register({
            isGlobal: true,
            ttl: 300000, // 5 minutes
            max: 100,
        }),
        ScheduleModule.forRoot(),
        CommandModule,
        
        // Helper modules
        HelperModule.forRoot(),
        PaginationModule.forRoot(),
        DatabaseModule.forRoot(),
        MessageModule.forRoot(),
        
        // Repository modules only (no controllers)
        UserRepositoryModule,
        RoleRepositoryModule,
        PasswordHistoryRepositoryModule,
        SessionRepositoryModule,
        ActivityRepositoryModule,
        SettingRepositoryModule,
        ToolsRepositoryModule,
        PlanRepositoryModule,
        LeaveRepositoryModule,
        DocumentRepositoryModule,
        ContractRepositoryModule,
        NotificationRepositoryModule,
        CompanyRepositoryModule,
        LocationRepositoryModule,
        CategoryRepositoryModule,
        ProductRepositoryModule,
        VendorRepositoryModule,
        RebateRepositoryModule,
        ExpenseRepositoryModule,
        GrnRepositoryModule,
        PoVendorRepositoryModule,
        InventoryRepositoryModule,

        // Email module for templates
        EmailModule,

        // Feature modules
        RoleModule,
        forwardRef(() => UserModule),
        PortMasterModule,

        ToolDeletionModule
    ],
    providers: [
        // Services
        UserService,
        RoleService,
        PasswordHistoryService,
        SessionService,
        ActivityService,
        SettingService,
        ToolsService,
        PlanService,

        // Seeds
        MigrationUserSeed,
        MigrationCatalogSeed,
        MigrationStockBackfillSeed,
        MigrationRoleSeed,
        MigrationRoleCategorySeed,
        MigrationFixAdminPermissionsSeed,
        MigrationTemplateSeed,
        MigrationSettingFeatureSeed,
        MigrationTemplateSeed,
        MigrationUpdateRolePermissionsSeed,
        MigrationPlanLocationPricingSeed,
        MigrationPlanPricingSimplifySeed,
        MigrationPlanStructureCleanupSeed,
        MigrationToolsDisplayOrderSeed,
        MigrationToolsSetDisplayOrderSeed,
        MigrationFreshInitSeed,
        MigrationToolsSeed,
        MigrationHrmPlansSeed,
        MigrationLeaveTypesSeed,
        MigrationDocumentCategoriesSeed,
        MigrationSyncCustomRolePermissionsSeed,
        MigrationContractTemplatesSeed,
        MigrationNotificationEventsSeed,
        MigrationProductionSeed,
        MigrationTradeDataSeed,
        MigrationPortMasterSeed,
        MigrationShivatradeTenantSeed,

        // Tools widgets and settings migration
        MigrateToolsWidgetsSettingsCommand,
    ],
    exports: [],
})
export class MigrationModule {}