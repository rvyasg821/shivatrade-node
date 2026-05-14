import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    LeadActivityDoc,
    LeadActivityEntity,
} from '../entities/lead-activity.entity';

@Injectable()
export class LeadActivityRepository extends DatabaseObjectIdRepositoryBase<LeadActivityEntity> {
    constructor(
        @InjectDatabaseModel(LeadActivityEntity)
        private readonly leadActivityRepository: Repository<LeadActivityEntity>
    ) {
        super(leadActivityRepository);
    }

    /**
     * Lead's timeline ordered newest-first. Soft-deleted rows are excluded
     * (deleted notes shouldn't show in the feed).
     */
    async findByLeadId(leadId: string): Promise<LeadActivityDoc[]> {
        return this._repository.find({
            where: { lead_id: leadId, soft_delete: false } as any,
            order: { createdAt: 'DESC' },
        });
    }
}
