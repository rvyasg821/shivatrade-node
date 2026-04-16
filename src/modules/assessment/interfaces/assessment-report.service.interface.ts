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
    AssessmentReportDoc,
    AssessmentReportEntity,
} from '@modules/assessment/repository/entities/assessment-report.entity';

export interface IAssessmentReportService {
    findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<AssessmentReportDoc[]>;

    getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;

    findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<AssessmentReportDoc>;

    findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<AssessmentReportDoc>;

    create(
        data: Partial<AssessmentReportEntity>,
        options?: IDatabaseCreateOptions
    ): Promise<AssessmentReportDoc>;

    update(
        repository: AssessmentReportDoc,
        data: Partial<AssessmentReportEntity>,
        options?: IDatabaseSaveOptions
    ): Promise<AssessmentReportDoc>;

    delete(
        repository: AssessmentReportDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<AssessmentReportDoc>;

    softDelete(
        repository: AssessmentReportDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<AssessmentReportDoc>;

    restore(
        repository: AssessmentReportDoc,
        options?: IDatabaseSaveOptions
    ): Promise<AssessmentReportDoc>;
}