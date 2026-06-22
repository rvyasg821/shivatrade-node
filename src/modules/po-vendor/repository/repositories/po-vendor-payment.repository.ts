import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    PoVendorPaymentDoc,
    PoVendorPaymentEntity,
} from '../entities/po-vendor-payment.entity';

@Injectable()
export class PoVendorPaymentRepository extends DatabaseObjectIdRepositoryBase<PoVendorPaymentEntity> {
    constructor(
        @InjectDatabaseModel(PoVendorPaymentEntity)
        private readonly poVendorPaymentRepository: Repository<PoVendorPaymentEntity>
    ) {
        super(poVendorPaymentRepository);
    }

    /** All non-deleted payments (incl. voided, for audit display). */
    async findActiveByPoVendorId(
        poVendorId: string
    ): Promise<PoVendorPaymentDoc[]> {
        return this.findAll({
            po_vendor_id: poVendorId,
            soft_delete: false,
        } as any);
    }

    /** Sum of non-voided, non-deleted payments — drives status + balance. */
    async sumActiveByPoVendorId(poVendorId: string): Promise<number> {
        const row = await this._repository
            .createQueryBuilder('p')
            .where('p.po_vendor_id = :id', { id: poVendorId })
            .andWhere('p.soft_delete = false')
            .andWhere('p.voided_at IS NULL')
            .select('COALESCE(SUM(p.amount), 0)', 'total')
            .getRawOne();
        return Number(row?.total || 0);
    }
}
