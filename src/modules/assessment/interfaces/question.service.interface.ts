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
    QuestionDoc,
    QuestionEntity,
} from '@modules/assessment/repository/entities/question.entity';

export interface IQuestionService {
    findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<QuestionDoc[]>;

    getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;

    findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<QuestionDoc>;

    findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<QuestionDoc>;

    create(
        data: Partial<QuestionEntity>,
        options?: IDatabaseCreateOptions
    ): Promise<QuestionDoc>;

    update(
        repository: QuestionDoc,
        data: Partial<QuestionEntity>,
        options?: IDatabaseSaveOptions
    ): Promise<QuestionDoc>;

    delete(
        repository: QuestionDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<QuestionDoc>;

    softDelete(
        repository: QuestionDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<QuestionDoc>;

    restore(
        repository: QuestionDoc,
        options?: IDatabaseSaveOptions
    ): Promise<QuestionDoc>;

    getMaxOrderForSection(
        sectionId: string
    ): Promise<number>;

    // New methods
    getSectionsWithQuestionsAndAnswers(
        assessmentId: string,
        assessmentReportId: string
    ): Promise<any>;

    getQuestionByAssessmentId(
        assessment_id: string,
        asessment_report_id: string
    ): Promise<any>;
}