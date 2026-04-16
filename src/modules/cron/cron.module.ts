import { Module, forwardRef } from '@nestjs/common';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { PaymentModule } from '@modules/payment/payment.module';
import { UserModule } from '@modules/user/user.module';
import { CompanyModule } from '@modules/company/company.module';
import { PlanModule } from '@modules/plan/plan.module';
import { DiscountModule } from '@modules/discount/discount.module';
import { SubscriptionCronService } from '@modules/cron/services/subscription-cron.service';
import { CronAdminController } from '@modules/cron/controllers/cron.admin.controller';
import { EmailModule } from '@modules/email/email.module';
import { CardModule } from '@modules/card/card.module';
import { ComplianceModule } from '@modules/compliance/compliance.module';

@Module({
    imports: [
        SubscriptionModule,
        PaymentModule,
        UserModule,
        CompanyModule,
        PlanModule,
        DiscountModule,
        EmailModule,
        CardModule,
        ComplianceModule,
    ],
    providers: [SubscriptionCronService],
    exports: [SubscriptionCronService],
    controllers: [CronAdminController],
})
export class CronModule { }
