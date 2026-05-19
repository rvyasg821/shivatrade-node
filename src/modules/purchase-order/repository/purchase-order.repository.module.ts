import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { PurchaseOrderEntity } from './entities/purchase-order.entity';
import { PurchaseOrderLineEntity } from './entities/purchase-order-line.entity';
import { PurchaseOrderRepository } from './repositories/purchase-order.repository';
import { PurchaseOrderLineRepository } from './repositories/purchase-order-line.repository';

@Module({
    providers: [PurchaseOrderRepository, PurchaseOrderLineRepository],
    exports: [PurchaseOrderRepository, PurchaseOrderLineRepository],
    imports: [
        TypeOrmModule.forFeature(
            [PurchaseOrderEntity, PurchaseOrderLineEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class PurchaseOrderRepositoryModule {}
