import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { ActivityModule } from '@modules/activity/activity.module';
import { ActivitySharedController } from '@modules/activity/controllers/activity.shared.controller';

import { AuthModule } from '@modules/auth/auth.module';
import { AuthSharedController } from '@modules/auth/controllers/auth.shared.controller';
import { EmailModule } from '@modules/email/email.module';
import { PasswordHistorySharedController } from '@modules/password-history/controllers/password-history.shared.controller';
import { PasswordHistoryModule } from '@modules/password-history/password-history.module';
import { SessionSharedController } from '@modules/session/controllers/session.shared.controller';
import { SessionModule } from '@modules/session/session.module';
import { UserModule } from '@modules/user/user.module';
import { ENUM_WORKER_QUEUES } from '@workers/enums/worker.enum';
import { CompanyModule } from '@modules/company/company.module';
import { CompanySharedController } from '@modules/company/controllers/company.shared.controller';
import { PlanModule } from '@modules/plan/plan.module';
import { PlanSharedController } from '@modules/plan/controllers/plan.shared.controller';
import { WidgetModule } from '@modules/widget/widget.module';
import { WidgetSharedController } from '@modules/widget/controllers/widget.shared.controller';

@Module({
    controllers: [
        AuthSharedController,
        SessionSharedController,
        PasswordHistorySharedController,
        ActivitySharedController,
        CompanySharedController,
        PlanSharedController,
        WidgetSharedController,
    ],
    providers: [],
    exports: [],
    imports: [
        UserModule,
        EmailModule,
        AuthModule,
        SessionModule,
        PasswordHistoryModule,
        ActivityModule,
        CompanyModule,
        PlanModule,
        WidgetModule,
        BullModule.registerQueueAsync({
            name: ENUM_WORKER_QUEUES.EMAIL_QUEUE,
        }),
    ],
})
export class RoutesSharedModule {}
