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
            {
                order: {
                    occurred_at: 'DESC' as any,
                    createdAt: 'DESC' as any,
                },
            }
        );
    }

    /** Returns ALL events for the shipping, including retracted (soft_delete=true).
     *  Used by the detail view so retracted rows render struck-through.
     *  Secondary sort on createdAt so events with the same occurred_at date
     *  still come out newest-first. */
    async findAllByShippingId(shippingId: string): Promise<ShippingEventDoc[]> {
        return this.findAll(
            { shipping_id: shippingId },
            {
                order: {
                    occurred_at: 'DESC' as any,
                    createdAt: 'DESC' as any,
                },
            }
        );
    }
}
