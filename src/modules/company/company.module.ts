import { Module, forwardRef } from '@nestjs/common';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyCleanupService } from '@modules/company/services/company-cleanup.service';
import { CompanyAdminController } from '@modules/company/controllers/company.admin.controller';
import { CompanySharedController } from '@modules/company/controllers/company.shared.controller';
import { CompanyParsePipe } from '@modules/company/pipes/company.parse.pipe';
import { CompanyOwnershipPipe } from '@modules/company/pipes/company.ownership.pipe';
// import { ActivityModule } from '@modules/activity/activity.module';
// import { MessageModule } from '@common/message/message.module';
import { PaginationModule } from '@common/pagination/pagination.module';
import { UserModule } from '@modules/user/user.module';
import { AuthModule } from '@modules/auth/auth.module';
import { RoleModule } from '@modules/role/role.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { PaymentModule } from '@modules/payment/payment.module';
import { LocationModule } from '@modules/location/location.module';
import { CardModule } from '@modules/card/card.module';
import { SessionModule } from '@modules/session/session.module';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';
import { EmailModule } from '@modules/email/email.module';
import { CurrencyModule } from '@modules/currency/currency.module';

@Module({
        imports: [
                CompanyRepositoryModule,
                // ActivityModule,
                // MessageModule,
                PaginationModule,
                forwardRef(() => UserModule),
                forwardRef(() => AuthModule),
                forwardRef(() => RoleModule),
                forwardRef(() => SubscriptionModule),
                forwardRef(() => PaymentModule),
                forwardRef(() => LocationModule),
                forwardRef(() => CardModule),
                forwardRef(() => SessionModule),
                forwardRef(() => CompanySettingsModule),
                forwardRef(() => EmailModule),
                CurrencyModule,
        ],
        exports: [CompanyService, CompanyCleanupService],
        providers: [CompanyService, CompanyCleanupService, CompanyParsePipe, CompanyOwnershipPipe],
        controllers: [CompanyAdminController, CompanySharedController],
})
export class CompanyModule { }
