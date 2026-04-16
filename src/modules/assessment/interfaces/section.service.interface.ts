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
    SectionDoc,
    SectionEntity,
} from '@modules/assessment/repository/entities/section.entity';

export interface ISectionService {
    findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<SectionDoc[]>;

    getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;

    findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<SectionDoc>;

    findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<SectionDoc>;

    create(
        data: Partial<SectionEntity>,
        options?: IDatabaseCreateOptions
    ): Promise<SectionDoc>;

    update(
        repository: SectionDoc,
        data: Partial<SectionEntity>,
        options?: IDatabaseSaveOptions
    ): Promise<SectionDoc>;

    delete(
        repository: SectionDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<SectionDoc>;

    softDelete(
        repository: SectionDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<SectionDoc>;

    restore(
        repository: SectionDoc,
        options?: IDatabaseSaveOptions
    ): Promise<SectionDoc>;

    getMaxOrderForAssessment(
        assessmentId: string
    ): Promise<number>;
}