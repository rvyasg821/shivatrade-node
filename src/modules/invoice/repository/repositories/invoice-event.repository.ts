import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    InvoiceEventDoc,
    InvoiceEventEntity,
} from '../entities/invoice-event.entity';

@Injectable()
export class InvoiceEventRepository extends DatabaseObjectIdRepositoryBase<InvoiceEventEntity> {
    constructor(
        @InjectDatabaseModel(InvoiceEventEntity)
        private readonly invoiceEventRepository: Repository<InvoiceEventEntity>
    ) {
        super(invoiceEventRepository);
    }

    /** Active (non-retracted) events, newest-first. */
    async findByInvoiceId(invoiceId: string): Promise<InvoiceEventDoc[]> {
        return this.findAll(
            { invoice_id: invoiceId, soft_delete: false },
            {
                order: {
                    occurred_at: 'DESC' as any,
                    createdAt: 'DESC' as any,
                },
            }
        );
    }

    /** ALL events incl. retracted (soft_delete=true) — the detail view renders
     *  retracted rows struck-through. Secondary sort on createdAt so events
     *  sharing an occurred_at date still come out newest-first. */
    async findAllByInvoiceId(invoiceId: string): Promise<InvoiceEventDoc[]> {
        return this.findAll(
            { invoice_id: invoiceId },
            {
                order: {
                    occurred_at: 'DESC' as any,
                    createdAt: 'DESC' as any,
                },
            }
        );
    }
}
