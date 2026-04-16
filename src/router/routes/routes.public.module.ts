import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { ActivityModule } from '@modules/activity/activity.module';
import { CompanyModule } from '@modules/company/company.module';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthPublicController } from '@modules/auth/controllers/auth.public.controller';
import { EmailModule } from '@modules/email/email.module';
import { HelloPublicController } from '@modules/hello/controllers/hello.public.controller';
import { PasswordHistoryModule } from '@modules/password-history/password-history.module';
import { ResetPasswordPublicController } from '@modules/reset-password/controllers/reset-password.public.controller';
import { ResetPasswordModule } from '@modules/reset-password/reset-password.module';
import { RoleModule } from '@modules/role/role.module';
import { SessionModule } from '@modules/session/session.module';
import { SettingModule } from '@modules/setting/setting.module';
import { UserModule } from '@modules/user/user.module';
import { ENUM_WORKER_QUEUES } from '@workers/enums/worker.enum';
import { PlanModule } from '@modules/plan/plan.module';
import { PlanPublicController } from '@modules/plan/controllers/plan.public.controller';
import { PaymentModule } from '@modules/payment/payment.module';
import { CardModule } from '@modules/card/card.module';
import { CardAdminController } from '@modules/card/controllers/card.admin.controller';
import { PaymentAdminController } from '@modules/payment/controllers/payment.admin.controller';
import { PaymentPublicController } from '@modules/payment/controllers/payment.public.controller';
import { CardPublicController } from '@modules/card/controllers/card.public.controller';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { SubscriptionPublicController } from '@modules/subscription/controllers/subscription.public.controller';
import { DiscountPublicController } from '@modules/discount/controllers/discount.public.controller';
import { DiscountModule } from '@modules/discount/discount.module';
import { ToolsModule } from '@modules/tools/tools.module';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';
import { LocationModule } from '@modules/location/location.module';
import { ToolsPublicController } from '@modules/tools/controllers/tools.public.controller';
import { StripeModule } from '@common/stripe/stripe.module';
import { SettingPublicController } from '@modules/setting/controllers/setting.public.controller';

@Module({
    controllers: [
        HelloPublicController,
        AuthPublicController,
        ResetPasswordPublicController,
        PlanPublicController,
        CardPublicController,
        PaymentPublicController,
        SubscriptionPublicController,
        DiscountPublicController,
        ToolsPublicController,
        SettingPublicController,
    ],
    providers: [],
    exports: [],
    imports: [
        SettingModule,
        UserModule,
        AuthModule,
        RoleModule,
        CompanyModule,
        EmailModule,
        PasswordHistoryModule,
        SessionModule,
        ActivityModule,
        ResetPasswordModule,
        PlanModule,

        BullModule.registerQueueAsync({
            name: ENUM_WORKER_QUEUES.EMAIL_QUEUE,
        }),
        PaymentModule,
        CardModule,
        SubscriptionModule,
        StripeModule,
        DiscountModule,
        ToolsModule,
        CompanySettingsModule,
        LocationModule,
    ],
})
export class RoutesPublicModule {}
