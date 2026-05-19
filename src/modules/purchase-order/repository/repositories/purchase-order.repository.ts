import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PurchaseOrderEntity } from '../entities/purchase-order.entity';

@Injectable()
export class PurchaseOrderRepository extends DatabaseObjectIdRepositoryBase<PurchaseOrderEntity> {
    constructor(
        @InjectDatabaseModel(PurchaseOrderEntity)
        private readonly purchaseOrderRepository: Repository<PurchaseOrderEntity>
    ) {
        super(purchaseOrderRepository);
    }
}
