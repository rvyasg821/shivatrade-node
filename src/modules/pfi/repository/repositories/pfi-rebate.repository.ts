import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PfiRebateEntity } from '../entities/pfi-rebate.entity';

@Injectable()
export class PfiRebateRepository extends DatabaseObjectIdRepositoryBase<PfiRebateEntity> {
    constructor(
        @InjectDatabaseModel(PfiRebateEntity)
        private readonly pfiRebateRepository: Repository<PfiRebateEntity>
    ) {
        super(pfiRebateRepository);
    }

    async deleteByPfiId(pfiId: string): Promise<void> {
        await this._repository
            .createQueryBuilder()
            .delete()
            .where('pfi_id = :id', { id: pfiId })
            .execute();
    }
}
