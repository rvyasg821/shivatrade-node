import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { InvoiceDoc, InvoiceEntity } from '../entities/invoice.entity';

@Injectable()
export class InvoiceRepository extends DatabaseObjectIdRepositoryBase<InvoiceEntity> {
    constructor(
        @InjectDatabaseModel(InvoiceEntity)
        private readonly invoiceRepository: Repository<InvoiceEntity>
    ) {
        super(invoiceRepository);
    }

    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<InvoiceDoc[]> {
        return this.findAll(
            { company_id: companyId, soft_delete: false },
            options
        );
    }

    /** Case-insensitive duplicate-voucher check within a company. */
    async isVoucherNoExists(
        companyId: string,
        voucherNo: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            voucher_no: ILike(voucherNo.trim()),
            soft_delete: false,
        };
        if (excludeId) where._id = Not(excludeId);
        const count = await this._repository.count({ where });
        return count > 0;
    }

    /** Sum of qty already invoiced (non-cancelled) against a PO line - used by qty guard. */
    async sumQtyByPoLineId(purchaseOrderLineId: string): Promise<number> {
        const row = await this._repository
            .createQueryBuilder('i')
            .innerJoin(
                'invoice_lines',
                'il',
                'il.invoice_id = i._id AND il.purchase_order_line_id = :polId',
                { polId: purchaseOrderLineId }
            )
            .where('i.soft_delete = false')
            .andWhere("i.status <> 'cancelled'")
            .select('COALESCE(SUM(il.qty), 0)', 'total')
            .getRawOne();
        return Number(row?.total || 0);
    }
}
