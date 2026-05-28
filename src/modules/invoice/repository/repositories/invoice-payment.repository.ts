import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    InvoicePaymentDoc,
    InvoicePaymentEntity,
} from '../entities/invoice-payment.entity';

@Injectable()
export class InvoicePaymentRepository extends DatabaseObjectIdRepositoryBase<InvoicePaymentEntity> {
    constructor(
        @InjectDatabaseModel(InvoicePaymentEntity)
        private readonly invoicePaymentRepository: Repository<InvoicePaymentEntity>
    ) {
        super(invoicePaymentRepository);
    }

    async findActiveByInvoiceId(
        invoiceId: string
    ): Promise<InvoicePaymentDoc[]> {
        return this.findAll({
            invoice_id: invoiceId,
            soft_delete: false,
        } as any);
    }

    /** Sum of non-voided, non-deleted payments — drives status + balance. */
    async sumActiveByInvoiceId(invoiceId: string): Promise<number> {
        const row = await this._repository
            .createQueryBuilder('p')
            .where('p.invoice_id = :id', { id: invoiceId })
            .andWhere('p.soft_delete = false')
            .andWhere('p.voided_at IS NULL')
            .select('COALESCE(SUM(p.amount), 0)', 'total')
            .getRawOne();
        return Number(row?.total || 0);
    }
}
