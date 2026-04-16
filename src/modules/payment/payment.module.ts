import { Module, forwardRef } from '@nestjs/common';
import { PaymentRepositoryModule } from './repository/payment.repository.module';
import { PaymentService } from './services/payment.service';
import { PaymentAdminController } from './controllers/payment.admin.controller';
import { PaymentPublicController } from './controllers/payment.public.controller';
import { RoleModule } from '@modules/role/role.module';
import { PayPalModule } from '@common/paypal/paypal.module';
import { StripeModule } from '@common/stripe/stripe.module';
import { CardModule } from '@modules/card/card.module';
import { PlanModule } from '@modules/plan/plan.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { UserModule } from '@modules/user/user.module';
import { HelperModule } from '@common/helper/helper.module';
import { CompanyRepositoryModule } from '@modules/company/repository/company.repository.module';
import { DiscountModule } from '@modules/discount/discount.module';
import { LocationModule } from '@modules/location/location.module';

@Module({
    imports: [
        PaymentRepositoryModule,
        forwardRef(() => RoleModule),
        PayPalModule,
        StripeModule,
        forwardRef(() => CardModule),
        PlanModule,
        forwardRef(() => SubscriptionModule),
        forwardRef(() => UserModule),
        HelperModule,
        CompanyRepositoryModule,
        DiscountModule,
        forwardRef(() => LocationModule),
    ],
    exports: [PaymentService],
    providers: [PaymentService],
    controllers: [PaymentAdminController, PaymentPublicController],
})
export class PaymentModule { }