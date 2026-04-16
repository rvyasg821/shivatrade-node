import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PlanEntity } from '@modules/plan/repository/entities/plan.entity';
import { ENUM_PLAN_STATUS } from '@modules/plan/enums/plan.enum';
import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseUpdateOptions,
} from '@common/database/interfaces/database.interface';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class PlanRepository extends DatabaseObjectIdRepositoryBase<
    PlanEntity
> {
    constructor(
        @InjectDatabaseModel(PlanEntity)
        private readonly planRepository: Repository<PlanEntity>
    ) {
        super(planRepository);
    }

    async findAllActive(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<PlanEntity[]> {
        return this.findAll(
            {
                ...find,
                status: ENUM_PLAN_STATUS.ACTIVE,
            },
            options
        );
    }

    async findByStatus(
        status: ENUM_PLAN_STATUS,
        options?: IDatabaseFindAllOptions
    ): Promise<PlanEntity[]> {
        return this.findAll({ status }, options);
    }

    async findDefault(options?: IDatabaseFindOneOptions): Promise<PlanEntity> {
        return this.findOne(
            {
                isDefault: true,
                status: ENUM_PLAN_STATUS.ACTIVE,
            },
            options
        );
    }

    async findByName(
        name: string,
        options?: IDatabaseFindOneOptions
    ): Promise<PlanEntity> {
        return this.findOne({ name }, options);
    }

    async updateDisplayOrder(
        plans: Array<{ id: string; order: number }>,
        options?: IDatabaseUpdateOptions
    ): Promise<void> {
        for (const plan of plans) {
            await this.planRepository.update(
                { _id: plan.id } as any,
                { displayOrder: plan.order }
            );
        }
    }

    async setAsDefault(
        planId: string,
        options?: IDatabaseUpdateOptions
    ): Promise<void> {
        // First, unset all other plans as default
        await this.updateMany(
            { isDefault: true },
            { isDefault: false },
            options
        );

        // Then set the specified plan as default
        await this.planRepository.update(
            { _id: planId } as any,
            { isDefault: true }
        );
    }

    async countByStatus(status: ENUM_PLAN_STATUS): Promise<number> {
        return this.getTotal({ status });
    }

    async findActiveByDisplayOrder(
        options?: IDatabaseFindAllOptions
    ): Promise<PlanEntity[]> {
        return this.findAllActive(
            {},
            {
                ...options,
                order: {
                    displayOrder: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC,
                    createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC
                },
            }
        );
    }
}
