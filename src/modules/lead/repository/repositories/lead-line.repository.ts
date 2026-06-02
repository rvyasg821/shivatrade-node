import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { LeadLineDoc, LeadLineEntity } from '../entities/lead-line.entity';

@Injectable()
export class LeadLineRepository extends DatabaseObjectIdRepositoryBase<LeadLineEntity> {
    constructor(
        @InjectDatabaseModel(LeadLineEntity)
        private readonly leadLineRepository: Repository<LeadLineEntity>
    ) {
        super(leadLineRepository);
    }

    /** Lead's requirement lines, in declared (seq) order. */
    async findByLeadId(leadId: string): Promise<LeadLineDoc[]> {
        return this._repository.find({
            where: { lead_id: leadId, soft_delete: false } as any,
            order: { seq: 'ASC' },
        });
    }

    /** Hard-delete all lines for a lead (replace-on-save strategy). */
    async deleteByLeadId(leadId: string): Promise<void> {
        await this._repository.delete({ lead_id: leadId } as any);
    }
}
