import { Injectable } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { CardDoc, CardEntity } from '../entities/card.entity';
import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
} from '@common/database/interfaces/database.interface';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class CardRepository extends DatabaseObjectIdRepositoryBase<CardEntity> {
    constructor(
        @InjectDatabaseModel(CardEntity)
        private readonly cardRepository: Repository<CardEntity>
    ) {
        super(cardRepository);
    }

    async findAll<T = CardDoc>(find?: Record<string, any>, options?: IDatabaseFindAllOptions): Promise<T[]> {
        return super.findAll<T>({ ...find, soft_delete: false }, options);
    }

    async findOne<T = CardDoc>(find: Record<string, any>, options?: IDatabaseFindOneOptions): Promise<T> {
        return super.findOne<T>({ ...find, soft_delete: false }, options);
    }

    async findOneById<T = CardDoc>(_id: string, options?: IDatabaseFindOneOptions): Promise<T> {
        return this.findOne<T>({ _id }, options);
    }

    async findOneSort(find: Record<string, any>, sortField: string = 'createdAt', sortOrder: number = -1): Promise<CardDoc> {
        const sortObj: Record<string, any> = {};
        sortObj[sortField] = sortOrder === -1 ? 'DESC' : 'ASC';

        return super.findOne<CardDoc>(
            { ...find, soft_delete: false },
            { order: sortObj }
        );
    }

    async updateById(id: string, updateData: Partial<CardEntity>): Promise<CardDoc> {
        const entity = await this._repository.findOne({ where: { _id: id } as any });
        if (!entity) return null;
        Object.assign(entity, updateData);
        return this._repository.save(entity) as any as Promise<CardDoc>;
    }

    async getTotal(find?: Record<string, any>): Promise<number> {
        return super.getTotal({ ...find, soft_delete: false });
    }

    async findByUserId(
        userId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<CardDoc[]> {
        return this.findAll(
            { user_id: userId },
            {
                ...options,
                order: {
                    is_default: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC,
                    createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC,
                },
            }
        );
    }

    async findActiveByUserId(
        userId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<CardDoc[]> {
        return this.findAll(
            {
                user_id: userId,
                status: true,
            },
            {
                ...options,
                order: {
                    is_default: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC,
                    createdAt: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC,
                },
            }
        );
    }

    async findDefaultByUserId(
        userId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<CardDoc> {
        return this.findOne(
            {
                user_id: userId,
                is_default: true,
                status: true,
            },
            options
        );
    }

    async countByUserId(userId: string): Promise<number> {
        return this.getTotal({
            user_id: userId,
            status: true,
        });
    }

    async unsetDefaultForUser(userId: string): Promise<void> {
        await this._repository.update(
            { user_id: userId, is_default: true } as any,
            { is_default: false } as any
        );
    }

    async softDeleteById(cardId: string): Promise<CardDoc> {
        const entity = await this._repository.findOne({ where: { _id: cardId } as any });
        if (!entity) return null;
        (entity as any).soft_delete = true;
        (entity as any).status = false;
        return this._repository.save(entity) as any as Promise<CardDoc>;
    }

    async deleteByUserIds(userIds: string[]): Promise<number> {
        const result = await this._repository.delete({ user_id: In(userIds) } as any);
        return result.affected || 0;
    }
}
