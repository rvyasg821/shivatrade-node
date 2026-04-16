import { Injectable } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PayslipLineItemEntity } from '../entities/payslip-line-item.entity';

@Injectable()
export class PayslipLineItemRepository extends DatabaseObjectIdRepositoryBase<PayslipLineItemEntity> {
    constructor(
        @InjectDatabaseModel(PayslipLineItemEntity)
        private readonly repo: Repository<PayslipLineItemEntity>
    ) {
        super(repo);
    }

    /**
     * Hard-delete all auto-generated line items for a payslip. Used when
     * recalculating so we don't double up auto items, while preserving
     * any line items the admin manually added.
     */
    async deleteAutoItems(payslipId: string): Promise<number> {
        const result = await (this as any)._repository.delete({
            payslip_id: payslipId,
            is_auto: true,
        });
        return result.affected || 0;
    }

    /**
     * Bulk soft-delete line items for multiple payslips in one query.
     * Used during pay run recalculation when orphaned payslips are removed.
     */
    async bulkSoftDeleteByPayslipIds(payslipIds: string[]): Promise<number> {
        if (!payslipIds || payslipIds.length === 0) return 0;
        const result = await this.repo.update(
            { payslip_id: In(payslipIds) as any },
            { soft_delete: true, updatedAt: new Date() } as any,
        );
        return result.affected || 0;
    }
}
