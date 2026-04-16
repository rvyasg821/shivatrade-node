import { Module } from '@nestjs/common';
import { CommonModule } from '@common/common.module';
import { AppMiddlewareModule } from '@app/app.middleware.module';
import { WorkerModule } from '@workers/worker.module';
import { RouterModule } from '@router';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';

import { CronModule } from '@modules/cron/cron.module';
import { NotificationModule } from '@modules/notification/notification.module';
import { MessageLogModule } from '@modules/message-log/message-log.module';

@Module({
    controllers: [],
    providers: [],
    imports: [
        ServeStaticModule.forRoot({
            rootPath: join(process.cwd(), 'public'),
            serveRoot: '/assets',
        }),
        ScheduleModule.forRoot(),
        // Common
        CommonModule,
        AppMiddlewareModule,

        // Cron
        CronModule,

        // Routes
        RouterModule,

        // Message Log (global, must be before NotificationModule and any provider services)
        MessageLogModule,

        // Notification (global)
        NotificationModule,

        // Workers
        WorkerModule,
    ],
})
export class AppModule {}
