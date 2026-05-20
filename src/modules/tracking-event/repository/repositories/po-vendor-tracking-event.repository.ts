import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PoVendorTrackingEventEntity } from '../entities/po-vendor-tracking-event.entity';

@Injectable()
export class PoVendorTrackingEventRepository extends DatabaseObjectIdRepositoryBase<PoVendorTrackingEventEntity> {
    constructor(
        @InjectDatabaseModel(PoVendorTrackingEventEntity)
        private readonly trackingEventRepository: Repository<PoVendorTrackingEventEntity>
    ) {
        super(trackingEventRepository);
    }
}
