import { Module, forwardRef } from '@nestjs/common';
import { LocationRepositoryModule } from './repository/location.repository.module';
import { LocationService } from './services/location.service';
import { LocationValidationService } from './services/location.validation.service';
import { LocationAdminController } from './controllers/location.admin.controller';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { CompanySettingsModule } from '@modules/company-settings/company-settings.module';

@Module({
    imports: [
        LocationRepositoryModule,
        forwardRef(() => SubscriptionModule),
        CompanySettingsModule,
    ],
    providers: [
        LocationService,
        LocationValidationService,
    ],
    exports: [
        LocationRepositoryModule,
        LocationService,
        LocationValidationService,
    ],
    controllers: [
        LocationAdminController,
    ],
})
export class LocationModule {}
