import { Injectable } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    InvoiceLineDoc,
    InvoiceLineEntity,
} from '../entities/invoice-line.entity';

@Injectable()
export class InvoiceLineRepository extends DatabaseObjectIdRepositoryBase<InvoiceLineEntity> {
    constructor(
        @InjectDatabaseModel(InvoiceLineEntity)
        private readonly invoiceLineRepository: Repository<InvoiceLineEntity>
    ) {
        super(invoiceLineRepository);
    }

    async findByInvoiceId(invoiceId: string): Promise<InvoiceLineDoc[]> {
        return this.findAll(
            { invoice_id: invoiceId, soft_delete: false },
            { order: { seq: 'ASC' as any } }
        );
    }

    async deleteByInvoiceId(invoiceId: string): Promise<number> {
        const result = await this._repository.delete({
            invoice_id: invoiceId,
        } as any);
        return result.affected || 0;
    }

    async findByInvoiceIds(invoiceIds: string[]): Promise<InvoiceLineDoc[]> {
        if (!invoiceIds.length) return [];
        return this._repository.find({
            where: { invoice_id: In(invoiceIds), soft_delete: false } as any,
            order: { seq: 'ASC' },
        });
    }
}
