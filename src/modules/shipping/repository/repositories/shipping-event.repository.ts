import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    ShippingEventDoc,
    ShippingEventEntity,
} from '../entities/shipping-event.entity';

@Injectable()
export class ShippingEventRepository extends DatabaseObjectIdRepositoryBase<ShippingEventEntity> {
    constructor(
        @InjectDatabaseModel(ShippingEventEntity)
        private readonly shippingEventRepository: Repository<ShippingEventEntity>
    ) {
        super(shippingEventRepository);
    }

    async findByShippingId(shippingId: string): Promise<ShippingEventDoc[]> {
        return this.findAll(
            { shipping_id: shippingId, soft_delete: false },
            { order: { occurred_at: 'DESC' as any } }
        );
    }
}
