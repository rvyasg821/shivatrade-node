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
import { QuestionAnswerRepository } from '@modules/assessment/repository/repositories/question-answer.repository';
import {
    QuestionAnswerDoc,
    QuestionAnswerEntity,
} from '@modules/assessment/repository/entities/question-answer.entity';
import { IQuestionAnswerService } from '@modules/assessment/interfaces/question-answer.service.interface';

@Injectable()
export class QuestionAnswerService implements IQuestionAnswerService {
    constructor(
        private readonly questionAnswerRepository: QuestionAnswerRepository,
    ) { }

    setTenantConnection(_connection: any) {
        // No-op: TypeORM uses a shared connection pool
    }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<QuestionAnswerDoc[]> {
        return this.questionAnswerRepository.findAll<QuestionAnswerDoc>(find, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.questionAnswerRepository.getTotal(find, options);
    }

    async findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<QuestionAnswerDoc> {
        return this.questionAnswerRepository.findOneById<QuestionAnswerDoc>(_id, options);
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<QuestionAnswerDoc> {
        return this.questionAnswerRepository.findOne<QuestionAnswerDoc>(find, options);
    }

    async create(
        data: Partial<QuestionAnswerEntity>,
        options?: IDatabaseCreateOptions
    ): Promise<QuestionAnswerDoc> {
        const create: QuestionAnswerEntity = new QuestionAnswerEntity();
        create.company_id = data.company_id;
        create.asessment_report_id = data.asessment_report_id;
        create.user_id = data.user_id;
        create.section_id = data.section_id;
        create.question_id = data.question_id;
        create.parent_question_id = data.parent_question_id;
        create.question_data = data.question_data;
        create.value = data.value;
        create.status = data.status || 1;

        return this.questionAnswerRepository.create<QuestionAnswerEntity>(create, options);
    }

    async update(
        repository: QuestionAnswerDoc,
        data: Partial<QuestionAnswerEntity>,
        options?: IDatabaseSaveOptions
    ): Promise<QuestionAnswerDoc> {
        if (data.company_id !== undefined) repository.company_id = data.company_id;
        if (data.asessment_report_id !== undefined) repository.asessment_report_id = data.asessment_report_id;
        if (data.user_id !== undefined) repository.user_id = data.user_id;
        if (data.section_id !== undefined) repository.section_id = data.section_id;
        if (data.question_id !== undefined) repository.question_id = data.question_id;
        if (data.parent_question_id !== undefined) repository.parent_question_id = data.parent_question_id;
        if (data.question_data !== undefined) repository.question_data = data.question_data;
        if (data.value !== undefined) repository.value = data.value;
        if (data.status !== undefined) repository.status = data.status;

        return this.questionAnswerRepository.save(repository, options);
    }

    async delete(
        repository: QuestionAnswerDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<QuestionAnswerDoc> {
        return this.questionAnswerRepository.delete({ _id: repository._id }, options);
    }

    async softDelete(
        repository: QuestionAnswerDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<QuestionAnswerDoc> {
        return this.questionAnswerRepository.softDelete(repository, options);
    }

    async restore(
        repository: QuestionAnswerDoc,
        options?: IDatabaseSaveOptions
    ): Promise<QuestionAnswerDoc> {
        return this.questionAnswerRepository.restore(repository, options);
    }
}