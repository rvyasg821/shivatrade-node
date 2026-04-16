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
import { AssessmentRepository } from '@modules/assessment/repository/repositories/assessment.repository';
import {
    AssessmentDoc,
    AssessmentEntity,
} from '@modules/assessment/repository/entities/assessment.entity';
import { IAssessmentService } from '@modules/assessment/interfaces/assessment.service.interface';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

@Injectable()
export class AssessmentService implements IAssessmentService {
    constructor(
        private readonly assessmentRepository: AssessmentRepository,
    ) { }

    setTenantConnection(_connection: any) {
        // No-op: TypeORM uses a shared connection pool
    }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<AssessmentDoc[]> {
        return this.assessmentRepository.findAll<AssessmentDoc>(find, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.assessmentRepository.getTotal(find, options);
    }

    async findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<AssessmentDoc> {
        return this.assessmentRepository.findOneById<AssessmentDoc>(_id, options);
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<AssessmentDoc> {
        return this.assessmentRepository.findOne<AssessmentDoc>(find, options);
    }

    async create(
        data: Partial<AssessmentEntity>,
        options?: IDatabaseCreateOptions
    ): Promise<AssessmentDoc> {
        const order = await this.getMaxOrderForSection();
        const create: AssessmentEntity = new AssessmentEntity();
        create.name = data.name;
        create.description = data.description;
        create.order = order ?? 1;
        create.show_score_calculation = data.show_score_calculation ?? false;
        create.additional_description = data.additional_description;
        create.status = data.status ?? 1;

        return this.assessmentRepository.create<AssessmentEntity>(create, options);
    }

    async update(
        repository: AssessmentDoc,
        data: Partial<AssessmentEntity>,
        options?: IDatabaseSaveOptions
    ): Promise<AssessmentDoc> {
        if (data.name !== undefined) repository.name = data.name;
        if (data.description !== undefined) repository.description = data.description;
        if (data.order !== undefined) repository.order = data.order;
        if (data.show_score_calculation !== undefined) repository.show_score_calculation = data.show_score_calculation;
        if (data.additional_description !== undefined) repository.additional_description = data.additional_description;
        if (data.status !== undefined) repository.status = data.status;

        return this.assessmentRepository.save(repository, options);
    }

    async delete(
        repository: AssessmentDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<AssessmentDoc> {
        return this.assessmentRepository.delete({ _id: repository._id }, options);
    }

    async softDelete(
        repository: AssessmentDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<AssessmentDoc> {
        return this.assessmentRepository.softDelete(repository, options);
    }

    async deleteById(
        assessmentId: string
    ): Promise<AssessmentDoc> {
        return this.assessmentRepository.delete({ _id: assessmentId });
    }

    async softDeleteById(
        assessmentId: string
    ): Promise<AssessmentDoc> {
        const repository = await this.findOneById(assessmentId);
        return this.assessmentRepository.softDelete(repository);
    }


    async restore(
        repository: AssessmentDoc,
        options?: IDatabaseSaveOptions
    ): Promise<AssessmentDoc> {
        return this.assessmentRepository.restore(repository, options);
    }

    async bulkWrite(operations: any[]): Promise<any> {
        return this.assessmentRepository.bulkWrite(operations);
    }

    async getMaxOrderForSection(): Promise<number> {
        const result = await this.assessmentRepository.findOne<AssessmentDoc>(
            { deleted: false },
            { order: { order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC } }
        );

        return result ? (result.order + 1) : 1;
    }
}