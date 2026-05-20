import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { PoVendorTrackingEventEntity } from './entities/po-vendor-tracking-event.entity';
import { PoVendorTrackingEventRepository } from './repositories/po-vendor-tracking-event.repository';

@Module({
    providers: [PoVendorTrackingEventRepository],
    exports: [PoVendorTrackingEventRepository],
    imports: [
        TypeOrmModule.forFeature(
            [PoVendorTrackingEventEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class TrackingEventRepositoryModule {}
