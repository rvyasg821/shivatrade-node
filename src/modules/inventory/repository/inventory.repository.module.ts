import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { StockMovementEntity } from './entities/stock-movement.entity';
import { StockMovementRepository } from './repositories/stock-movement.repository';

@Module({
    providers: [StockMovementRepository],
    exports: [StockMovementRepository],
    imports: [
        TypeOrmModule.forFeature(
            [StockMovementEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class InventoryRepositoryModule {}
