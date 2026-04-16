import { Injectable } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PayslipEntity } from '../entities/payslip.entity';

@Injectable()
export class PayslipRepository extends DatabaseObjectIdRepositoryBase<PayslipEntity> {
    constructor(
        @InjectDatabaseModel(PayslipEntity)
        private readonly repo: Repository<PayslipEntity>
    ) {
        super(repo);
    }

    /**
     * Bulk soft-delete payslips by id. Used during pay run recalculation
     * to clean up orphaned payslips whose user has been deleted from the
     * system. Single UPDATE query instead of a loop.
     */
    async bulkSoftDelete(ids: string[]): Promise<number> {
        if (!ids || ids.length === 0) return 0;
        const result = await this.repo.update(
            { _id: In(ids) as any },
            { soft_delete: true, updatedAt: new Date() } as any,
        );
        return result.affected || 0;
    }
}
