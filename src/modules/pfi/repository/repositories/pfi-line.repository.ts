import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PfiLineEntity } from '../entities/pfi-line.entity';

@Injectable()
export class PfiLineRepository extends DatabaseObjectIdRepositoryBase<PfiLineEntity> {
    constructor(
        @InjectDatabaseModel(PfiLineEntity)
        private readonly pfiLineRepository: Repository<PfiLineEntity>
    ) {
        super(pfiLineRepository);
    }

    async deleteByPfiId(pfiId: string): Promise<void> {
        await this._repository
            .createQueryBuilder()
            .delete()
            .where('pfi_id = :id', { id: pfiId })
            .execute();
    }
}
