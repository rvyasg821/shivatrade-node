import { Global, Module } from '@nestjs/common';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';
import { WhatsAppModule } from '@modules/whatsapp/whatsapp.module';
import { SmsModule } from '@modules/sms/sms.module';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';
import { RoleRepositoryModule } from '@modules/role/repository/role.repository.module';
import { NotificationRepositoryModule } from './repository/notification.repository.module';
import { NotificationService } from './services/notification.service';
import { NotificationRecipientResolverService } from './services/notification-recipient-resolver.service';

@Global()
@Module({
    imports: [
        NotificationRepositoryModule,
        CompanySettingsModule,
        WhatsAppModule,
        SmsModule,
        UserRepositoryModule,
        RoleRepositoryModule,
    ],
    controllers: [],
    providers: [NotificationService, NotificationRecipientResolverService],
    exports: [
        NotificationService,
        NotificationRecipientResolverService,
        NotificationRepositoryModule,
    ],
})
export class NotificationModule {}
