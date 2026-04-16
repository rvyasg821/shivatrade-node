import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
    AssessmentDoc,
    AssessmentEntity,
} from '@modules/assessment/repository/entities/assessment.entity';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';

import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseCreateOptions,
    IDatabaseSaveOptions,
    IDatabaseDeleteOptions,
    IDatabaseSoftDeleteOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class AssessmentRepository extends DatabaseObjectIdRepositoryBase<
    AssessmentEntity
> {
    constructor(
        @InjectDatabaseModel(AssessmentEntity)
        private readonly assessmentRepository: Repository<AssessmentEntity>
    ) {
        super(assessmentRepository);
    }

    async findAll<T = AssessmentDoc>(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<T[]> {
        return super.findAll<T>(find, options);
    }

    async findOne<T = AssessmentDoc>(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        return super.findOne<T>(find, options);
    }

    async findOneById<T = AssessmentDoc>(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        return super.findOneById<T>(_id, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return super.getTotal(find, options);
    }

    async bulkWrite(operations: any): Promise<void> {
        // Convert MongoDB-style bulkWrite operations to TypeORM
        if (Array.isArray(operations)) {
            for (const op of operations) {
                if (op.updateOne) {
                    const filter = op.updateOne.filter;
                    const update = op.updateOne.update?.$set || op.updateOne.update;
                    await this._repository.update(filter, update);
                } else if (op.insertOne) {
                    const entity = this._repository.create(op.insertOne.document);
                    await this._repository.save(entity);
                } else if (op.deleteOne) {
                    await this._repository.delete(op.deleteOne.filter);
                }
            }
        }
    }
}
