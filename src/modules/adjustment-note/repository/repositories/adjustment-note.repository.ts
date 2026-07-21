import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    AdjustmentNoteDoc,
    AdjustmentNoteEntity,
} from '../entities/adjustment-note.entity';

@Injectable()
export class AdjustmentNoteRepository extends DatabaseObjectIdRepositoryBase<AdjustmentNoteEntity> {
    constructor(
        @InjectDatabaseModel(AdjustmentNoteEntity)
        private readonly adjustmentNoteRepository: Repository<AdjustmentNoteEntity>
    ) {
        super(adjustmentNoteRepository);
    }

    /**
     * Notes linked to one document (invoice / POV). Voided rows come back too —
     * `sumAdjustmentEffect` skips them, so a void reverses the balance.
     */
    async findByDocumentId(documentId: string): Promise<AdjustmentNoteDoc[]> {
        return this.findAll({
            document_id: documentId,
            soft_delete: false,
        } as any);
    }

    /** Non-deleted, non-voided notes for one party — the ledger source. */
    async findActiveByParty(
        companyId: string,
        partyType: string,
        partyId: string
    ): Promise<AdjustmentNoteDoc[]> {
        return this.findAll({
            company_id: companyId,
            party_type: partyType,
            party_id: partyId,
            soft_delete: false,
        } as any);
    }
}
