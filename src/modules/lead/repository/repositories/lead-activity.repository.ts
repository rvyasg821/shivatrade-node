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

    /**
     * MAX(createdAt) per lead, used by the lead list to render the
     * "Last activity" column ("2d ago"). One query covers a page of leads.
     */
    async findLastActivityMap(
        leadIds: string[]
    ): Promise<Map<string, string>> {
        const out = new Map<string, string>();
        if (!leadIds.length) return out;
        const rows = await this._repository
            .createQueryBuilder('a')
            .select('a.lead_id', 'lead_id')
            .addSelect('MAX(a.createdAt)', 'last_at')
            .where('a.lead_id IN (:...ids)', { ids: leadIds })
            .andWhere('a.soft_delete = false')
            .groupBy('a.lead_id')
            .getRawMany<{ lead_id: string; last_at: Date }>();
        for (const r of rows) {
            if (r.lead_id && r.last_at) {
                out.set(r.lead_id, new Date(r.last_at).toISOString());
            }
        }
        return out;
    }
}
