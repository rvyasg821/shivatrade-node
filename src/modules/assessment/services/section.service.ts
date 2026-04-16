import { Injectable } from '@nestjs/common';
import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseCreateOptions,
    IDatabaseSaveOptions,
    IDatabaseDeleteOptions,
    IDatabaseSoftDeleteOptions,
} from '@common/database/interfaces/database.interface';
import { SectionRepository } from '@modules/assessment/repository/repositories/section.repository';
import {
    SectionDoc,
    SectionEntity,
} from '@modules/assessment/repository/entities/section.entity';
import { ISectionService } from '@modules/assessment/interfaces/section.service.interface';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class SectionService implements ISectionService {
    constructor(
        private readonly sectionRepository: SectionRepository,
    ) { }

    setTenantConnection(_connection: any) {
        // No-op: TypeORM uses a shared connection pool
    }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<SectionDoc[]> {
        return this.sectionRepository.findAll<SectionDoc>(find, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.sectionRepository.getTotal(find, options);
    }

    async findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<SectionDoc> {
        return this.sectionRepository.findOneById<SectionDoc>(_id, options);
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<SectionDoc> {
        return this.sectionRepository.findOne<SectionDoc>(find, options);
    }

    async create(
        data: Partial<SectionEntity>,
        options?: IDatabaseCreateOptions
    ): Promise<SectionDoc> {
        const sectionOrder = await this.getMaxOrderForAssessment(data?.assessment_id?.toString() as string);
        const create: SectionEntity = new SectionEntity();
        create.assessment_id = data.assessment_id;
        create.name = data.name;
        create.description = data.description;
        create.order = sectionOrder || 1;
        create.status = data.status || 1;

        return this.sectionRepository.create<SectionEntity>(create, options);
    }

    async update(
        repository: SectionDoc,
        data: Partial<SectionEntity>,
        options?: IDatabaseSaveOptions
    ): Promise<SectionDoc> {
        if (data.assessment_id !== undefined) repository.assessment_id = data.assessment_id;
        if (data.name !== undefined) repository.name = data.name;
        if (data.description !== undefined) repository.description = data.description;
        if (data.order !== undefined) repository.order = data.order;
        if (data.status !== undefined) repository.status = data.status;

        return this.sectionRepository.save(repository, options);
    }

    async delete(
        repository: SectionDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<SectionDoc> {
        return this.sectionRepository.delete({ _id: repository._id }, options);
    }

    async softDelete(
        repository: SectionDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<SectionDoc> {
        return this.sectionRepository.softDelete(repository, options);
    }

    async restore(
        repository: SectionDoc,
        options?: IDatabaseSaveOptions
    ): Promise<SectionDoc> {
        return this.sectionRepository.restore(repository, options);
    }

    async bulkWrite(operations: any[]): Promise<any> {
        return this.sectionRepository.bulkWrite(operations);
    }

    async findByAssessmentId(
        assessmentId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<SectionDoc[]> {
        return this.sectionRepository.findAll<SectionDoc>(
            { assessment_id: assessmentId, status: 1 },
            options
        );
    }

    async getMaxOrderForAssessment(assessmentId: string): Promise<number> {
        const result = await this.sectionRepository.findOne<SectionDoc>(
            { assessment_id: assessmentId, deleted: false },
            { order: { order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC } }
        );

        return result ? (result.order + 1) : 1;
    }
}