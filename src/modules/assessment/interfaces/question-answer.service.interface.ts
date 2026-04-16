import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseCreateOptions,
    IDatabaseUpdateOptions,
    IDatabaseDeleteOptions,
    IDatabaseSaveOptions,
    IDatabaseSoftDeleteOptions,
} from '@common/database/interfaces/database.interface';
import {
    QuestionAnswerDoc,
    QuestionAnswerEntity,
} from '@modules/assessment/repository/entities/question-answer.entity';

export interface IQuestionAnswerService {
    findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<QuestionAnswerDoc[]>;

    getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;

    findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<QuestionAnswerDoc>;

    findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<QuestionAnswerDoc>;

    create(
        data: Partial<QuestionAnswerEntity>,
        options?: IDatabaseCreateOptions
    ): Promise<QuestionAnswerDoc>;

    update(
        repository: QuestionAnswerDoc,
        data: Partial<QuestionAnswerEntity>,
        options?: IDatabaseSaveOptions
    ): Promise<QuestionAnswerDoc>;

    delete(
        repository: QuestionAnswerDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<QuestionAnswerDoc>;

    softDelete(
        repository: QuestionAnswerDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<QuestionAnswerDoc>;

    restore(
        repository: QuestionAnswerDoc,
        options?: IDatabaseSaveOptions
    ): Promise<QuestionAnswerDoc>;
}