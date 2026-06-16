import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    DebitNoteDoc,
    DebitNoteEntity,
} from '../entities/debit-note.entity';

@Injectable()
export class DebitNoteRepository extends DatabaseObjectIdRepositoryBase<DebitNoteEntity> {
    constructor(
        @InjectDatabaseModel(DebitNoteEntity)
        private readonly debitNoteRepository: Repository<DebitNoteEntity>
    ) {
        super(debitNoteRepository);
    }

    async findByGrnId(
        companyId: string,
        grnId: string
    ): Promise<DebitNoteDoc[]> {
        return this.findAll({
            company_id: companyId,
            grn_id: grnId,
            soft_delete: false,
        } as any);
    }
}
