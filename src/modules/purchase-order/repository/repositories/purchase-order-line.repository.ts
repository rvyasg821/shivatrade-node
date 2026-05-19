import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PurchaseOrderLineEntity } from '../entities/purchase-order-line.entity';

@Injectable()
export class PurchaseOrderLineRepository extends DatabaseObjectIdRepositoryBase<PurchaseOrderLineEntity> {
    constructor(
        @InjectDatabaseModel(PurchaseOrderLineEntity)
        private readonly purchaseOrderLineRepository: Repository<PurchaseOrderLineEntity>
    ) {
        super(purchaseOrderLineRepository);
    }

    async deleteByPurchaseOrderId(purchaseOrderId: string): Promise<void> {
        await this._repository
            .createQueryBuilder()
            .delete()
            .where('purchase_order_id = :id', { id: purchaseOrderId })
            .execute();
    }
}
