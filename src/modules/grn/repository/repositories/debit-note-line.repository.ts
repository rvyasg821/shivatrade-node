import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    DebitNoteLineDoc,
    DebitNoteLineEntity,
} from '../entities/debit-note-line.entity';

@Injectable()
export class DebitNoteLineRepository extends DatabaseObjectIdRepositoryBase<DebitNoteLineEntity> {
    constructor(
        @InjectDatabaseModel(DebitNoteLineEntity)
        private readonly debitNoteLineRepository: Repository<DebitNoteLineEntity>
    ) {
        super(debitNoteLineRepository);
    }

    async findByDebitNoteId(debitNoteId: string): Promise<DebitNoteLineDoc[]> {
        return this._repository.find({
            where: { debit_note_id: debitNoteId, soft_delete: false } as any,
            order: { seq: 'ASC' },
        });
    }

    async deleteByDebitNoteId(debitNoteId: string): Promise<void> {
        await this._repository.delete({ debit_note_id: debitNoteId } as any);
    }
}
