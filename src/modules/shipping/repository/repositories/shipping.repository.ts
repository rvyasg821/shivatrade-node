import { Injectable } from '@nestjs/common';
import { Repository, ILike, Not } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ShippingDoc, ShippingEntity } from '../entities/shipping.entity';

@Injectable()
export class ShippingRepository extends DatabaseObjectIdRepositoryBase<ShippingEntity> {
    constructor(
        @InjectDatabaseModel(ShippingEntity)
        private readonly shippingRepository: Repository<ShippingEntity>
    ) {
        super(shippingRepository);
    }

    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<ShippingDoc[]> {
        return this.findAll(
            { company_id: companyId, soft_delete: false },
            options
        );
    }

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
}
