import { Injectable } from '@nestjs/common';
import { Repository, IsNull, LessThan, ILike, Not, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    DiscountEntity,
} from '../entities/discount.entity';
import {
    IDatabaseFindAllOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class DiscountRepository extends DatabaseObjectIdRepositoryBase<
    DiscountEntity
> {
    constructor(
        @InjectDatabaseModel(DiscountEntity)
        private readonly discountRepository: Repository<DiscountEntity>
    ) {
        super(discountRepository);
    }

    async findAllActive(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<DiscountEntity[]> {
        return this.findAll(
            {
                ...find,
                status: 1,
                is_expired: false,
                deletedAt: IsNull(),
            },
            options
        );
    }

    async countByStatus(status: number): Promise<number> {
        return this.getTotal({ status, deletedAt: IsNull() });
    }

    async findByCode(code: string): Promise<DiscountEntity> {
        return this.discountRepository.findOne({
            where: {
                discount_code: ILike(code),
                deletedAt: IsNull(),
            },
        });
    }

    async findActiveByCode(code: string, date?: Date): Promise<DiscountEntity> {
        const currentDate = date || new Date();

        // First try: with date range
        const withDateRange = await this.discountRepository
            .createQueryBuilder('discount')
            .where('LOWER(discount.discount_code) = LOWER(:code)', { code })
            .andWhere('discount.status = :status', { status: 1 })
            .andWhere('discount.is_expired = :isExpired', { isExpired: false })
            .andWhere('discount.deletedAt IS NULL')
            .andWhere(
                '((discount.start_date <= :currentDate AND discount.end_date >= :currentDate) OR (discount.start_date IS NULL AND discount.end_date IS NULL))',
                { currentDate }
            )
            .getOne();

        return withDateRange;
    }

    async findExpiredDiscounts(): Promise<DiscountEntity[]> {
        const currentDate = new Date();

        return this.discountRepository.find({
            where: {
                status: 1,
                is_expired: false,
                deletedAt: IsNull(),
                end_date: LessThan(currentDate),
            },
        });
    }

    async countByCode(code: string): Promise<number> {
        return this.discountRepository.count({
            where: {
                discount_code: ILike(code),
                deletedAt: IsNull(),
            },
        });
    }

    async softDeleteManyByIds(ids: string[]): Promise<number> {
        const result = await this.discountRepository.update(
            { _id: In(ids) } as any,
            { deletedAt: new Date(), status: 0, deleted: true } as any
        );
        return result.affected || 0;
    }

    async hardDeleteManyByIds(ids: string[]): Promise<number> {
        const result = await this.discountRepository.delete(
            { _id: In(ids) } as any
        );
        return result.affected || 0;
    }
}
