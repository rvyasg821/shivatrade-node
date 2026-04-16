import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    DiscountAppliedEntity,
} from '../entities/discount-applied.entity';

@Injectable()
export class DiscountAppliedRepository extends DatabaseObjectIdRepositoryBase<
    DiscountAppliedEntity
> {
    constructor(
        @InjectDatabaseModel(DiscountAppliedEntity)
        private readonly discountAppliedRepository: Repository<DiscountAppliedEntity>
    ) {
        super(discountAppliedRepository);
    }

    async findByDiscountId(discountId: string): Promise<DiscountAppliedEntity[]> {
        return this.discountAppliedRepository.find({
            where: { discount_id: discountId } as any,
        });
    }

    async findBySubscriptionId(subscriptionId: string): Promise<DiscountAppliedEntity> {
        return this.discountAppliedRepository.findOne({
            where: { subscription_id: subscriptionId } as any,
        });
    }

    async findByUserId(userId: string): Promise<DiscountAppliedEntity[]> {
        return this.discountAppliedRepository.find({
            where: { user_id: userId } as any,
            relations: { discount_id: true } as any,
        });
    }

    async countByDiscountId(discountId: string): Promise<number> {
        return this.discountAppliedRepository.count({
            where: { discount_id: discountId } as any,
        });
    }

    async findByCompanyId(companyId: string): Promise<DiscountAppliedEntity[]> {
        return this.discountAppliedRepository.find({
            where: { company_id: companyId } as any,
            relations: { discount_id: true } as any,
        });
    }

    async countByDiscountIdAndUserId(
        discountId: string,
        userId: string
    ): Promise<number> {
        return this.discountAppliedRepository.count({
            where: { discount_id: discountId, user_id: userId } as any,
        });
    }
}
