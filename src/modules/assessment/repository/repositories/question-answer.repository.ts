import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
    QuestionAnswerDoc,
    QuestionAnswerEntity,
} from '@modules/assessment/repository/entities/question-answer.entity';
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
export class QuestionAnswerRepository extends DatabaseObjectIdRepositoryBase<
    QuestionAnswerEntity
> {
    constructor(
        @InjectDatabaseModel(QuestionAnswerEntity)
        private readonly questionAnswerRepository: Repository<QuestionAnswerEntity>
    ) {
        super(questionAnswerRepository);
    }

    async findAll<T = QuestionAnswerDoc>(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<T[]> {
        return super.findAll<T>(find, options);
    }

    async findOne<T = QuestionAnswerDoc>(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        return super.findOne<T>(find, options);
    }

    async findOneById<T = QuestionAnswerDoc>(
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
}
