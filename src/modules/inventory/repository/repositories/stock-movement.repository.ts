import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { StockMovementEntity } from '../entities/stock-movement.entity';

@Injectable()
export class StockMovementRepository extends DatabaseObjectIdRepositoryBase<StockMovementEntity> {
    constructor(
        @InjectDatabaseModel(StockMovementEntity)
        private readonly movementRepository: Repository<StockMovementEntity>
    ) {
        super(movementRepository);
    }

    /** Active (non-deleted) movements posted for one source document. */
    async findBySource(
        sourceType: string,
        sourceId: string
    ): Promise<StockMovementEntity[]> {
        return this.findAll({
            source_type: sourceType,
            source_id: sourceId,
        });
    }
}
