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
    AssessmentDoc,
    AssessmentEntity,
} from '@modules/assessment/repository/entities/assessment.entity';

export interface IAssessmentService {
    findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<AssessmentDoc[]>;

    getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;

    findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<AssessmentDoc>;

    findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<AssessmentDoc>;

    create(
        data: Partial<AssessmentEntity>,
        options?: IDatabaseCreateOptions
    ): Promise<AssessmentDoc>;

    update(
        repository: AssessmentDoc,
        data: Partial<AssessmentEntity>,
        options?: IDatabaseSaveOptions
    ): Promise<AssessmentDoc>;

    delete(
        repository: AssessmentDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<AssessmentDoc>;

    softDelete(
        repository: AssessmentDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<AssessmentDoc>;

    restore(
        repository: AssessmentDoc,
        options?: IDatabaseSaveOptions
    ): Promise<AssessmentDoc>;
}