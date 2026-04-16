import { Module, forwardRef } from '@nestjs/common';
import { CardRepositoryModule } from './repository/card.repository.module';
import { CardService } from './services/card.service';
import { CardAdminController } from './controllers/card.admin.controller';
import { CardPublicController } from './controllers/card.public.controller';
import { RoleModule } from '@modules/role/role.module';
import { UserModule } from '@modules/user/user.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { PaymentModule } from '@modules/payment/payment.module';

@Module({
    imports: [
        CardRepositoryModule,
        forwardRef(() => RoleModule),
        forwardRef(() => UserModule),
        forwardRef(() => SubscriptionModule),
        forwardRef(() => PaymentModule),
    ],
    exports: [CardService],
    providers: [CardService],
    controllers: [CardAdminController, CardPublicController],
})
export class CardModule { }