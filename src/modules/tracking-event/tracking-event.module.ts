import { Module } from '@nestjs/common';
import { TrackingEventRepositoryModule } from './repository/tracking-event.repository.module';
import { TrackingEventService } from './services/tracking-event.service';
import { TrackingEventFileService } from './services/tracking-event-file.service';
import { TrackingEventAdminController } from './controllers/tracking-event.admin.controller';

import { PoVendorRepositoryModule } from '@modules/po-vendor/repository/po-vendor.repository.module';
import { PurchaseOrderRepositoryModule } from '@modules/purchase-order/repository/purchase-order.repository.module';
import { VendorRepositoryModule } from '@modules/vendor/repository/vendor.repository.module';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';

/**
 * Tracking module - append-only event log on POVs (TRACKING_MODULE_PLAN).
 * Strictly depends on POV module being live (§17.8).
 */
@Module({
    imports: [
        TrackingEventRepositoryModule,
        PoVendorRepositoryModule,
        PurchaseOrderRepositoryModule,
        VendorRepositoryModule,
        UserRepositoryModule,
    ],
    providers: [TrackingEventService, TrackingEventFileService],
    exports: [
        TrackingEventRepositoryModule,
        TrackingEventService,
        TrackingEventFileService,
    ],
    controllers: [TrackingEventAdminController],
})
export class TrackingEventModule {}
