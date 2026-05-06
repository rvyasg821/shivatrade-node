import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PfiExpenseEntity } from '../entities/pfi-expense.entity';

@Injectable()
export class PfiExpenseRepository extends DatabaseObjectIdRepositoryBase<PfiExpenseEntity> {
    constructor(
        @InjectDatabaseModel(PfiExpenseEntity)
        private readonly pfiExpenseRepository: Repository<PfiExpenseEntity>
    ) {
        super(pfiExpenseRepository);
    }

    async deleteByPfiId(pfiId: string): Promise<void> {
        await this._repository
            .createQueryBuilder()
            .delete()
            .where('pfi_id = :id', { id: pfiId })
            .execute();
    }
}
