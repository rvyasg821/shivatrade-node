import { Injectable } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    ShippingInvoiceDoc,
    ShippingInvoiceEntity,
} from '../entities/shipping-invoice.entity';

@Injectable()
export class ShippingInvoiceRepository extends DatabaseObjectIdRepositoryBase<ShippingInvoiceEntity> {
    constructor(
        @InjectDatabaseModel(ShippingInvoiceEntity)
        private readonly shippingInvoiceRepository: Repository<ShippingInvoiceEntity>
    ) {
        super(shippingInvoiceRepository);
    }

    async findByShippingId(shippingId: string): Promise<ShippingInvoiceDoc[]> {
        return this._repository.find({
            where: { shipping_id: shippingId } as any,
            order: { createdAt: 'ASC' as any },
        });
    }

    async findByInvoiceId(invoiceId: string): Promise<ShippingInvoiceDoc | null> {
        return this._repository.findOne({
            where: { invoice_id: invoiceId } as any,
        });
    }

    async findByInvoiceIds(invoiceIds: string[]): Promise<ShippingInvoiceDoc[]> {
        if (!invoiceIds.length) return [];
        return this._repository.find({
            where: { invoice_id: In(invoiceIds) } as any,
        });
    }

    async deleteByShippingId(shippingId: string): Promise<number> {
        const r = await this._repository.delete({
            shipping_id: shippingId,
        } as any);
        return r.affected || 0;
    }
}
