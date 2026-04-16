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
import { QuestionRepository } from '@modules/assessment/repository/repositories/question.repository';
import {
    QuestionDoc,
    QuestionEntity,
} from '@modules/assessment/repository/entities/question.entity';
import { IQuestionService } from '@modules/assessment/interfaces/question.service.interface';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';
import { SectionRepository } from '../repository/repositories/section.repository';

@Injectable()
export class QuestionService implements IQuestionService {
    constructor(
        private readonly questionRepository: QuestionRepository,
        private readonly sectionRepository: SectionRepository,
    ) { }

    setTenantConnection(_connection: any) {
        // No-op: TypeORM uses a shared connection pool
    }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<QuestionDoc[]> {
        return this.questionRepository.findAll<QuestionDoc>(find, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.questionRepository.getTotal(find, options);
    }

    async findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<QuestionDoc> {
        return this.questionRepository.findOneById<QuestionDoc>(_id, options);
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<QuestionDoc> {
        return this.questionRepository.findOne<QuestionDoc>(find, options);
    }

    async create(
        data: Partial<QuestionEntity>,
        options?: IDatabaseCreateOptions
    ): Promise<QuestionDoc> {
        const questionOrder = await this.getMaxOrderForSection(data?.section_id?.toString() as string);

        const create: QuestionEntity = new QuestionEntity();
        create.assessment_id = data.assessment_id;
        create.section_id = data.section_id;
        create.parent_question_id = data.parent_question_id;
        create.is_child = data.is_child || false;
        create.question = data.question;
        create.description = data.description;
        create.option_type = data.option_type;
        create.options = data.options || [];
        create.value = data.value;
        create.is_mandatory = data.is_mandatory || false;
        create.point = data.point || 0;
        create.order = questionOrder || 1;
        create.status = data.status || 1;

        return this.questionRepository.create<QuestionEntity>(create, options);
    }

    async update(
        repository: QuestionDoc,
        data: Partial<QuestionEntity>,
        options?: IDatabaseSaveOptions
    ): Promise<QuestionDoc> {
        if (data.assessment_id !== undefined) repository.assessment_id = data.assessment_id;
        if (data.section_id !== undefined) repository.section_id = data.section_id;
        if (data.parent_question_id !== undefined) repository.parent_question_id = data.parent_question_id;
        if (data.is_child !== undefined) repository.is_child = data.is_child;
        if (data.question !== undefined) repository.question = data.question;
        if (data.description !== undefined) repository.description = data.description;
        if (data.option_type !== undefined) repository.option_type = data.option_type;
        if (data.options !== undefined) repository.options = data.options;
        if (data.value !== undefined) repository.value = data.value;
        if (data.is_mandatory !== undefined) repository.is_mandatory = data.is_mandatory;
        if (data.point !== undefined) repository.point = data.point;
        if (data.order !== undefined) repository.order = data.order;
        if (data.status !== undefined) repository.status = data.status;

        return this.questionRepository.save(repository, options);
    }

    async delete(
        repository: QuestionDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<QuestionDoc> {
        return this.questionRepository.delete({ _id: repository._id }, options);
    }

    async softDelete(
        repository: QuestionDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<QuestionDoc> {
        return this.questionRepository.softDelete(repository, options);
    }

    async restore(
        repository: QuestionDoc,
        options?: IDatabaseSaveOptions
    ): Promise<QuestionDoc> {
        return this.questionRepository.restore(repository, options);
    }

    async bulkWrite(operations: any[]): Promise<any> {
        return this.questionRepository.bulkWrite(operations);
    }

    async findByAssessmentId(
        assessmentId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<QuestionDoc[]> {
        return this.questionRepository.findAll<QuestionDoc>(
            { assessment_id: assessmentId, status: 1 },
            options
        );
    }

    async findBySectionId(
        sectionId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<QuestionDoc[]> {
        return this.questionRepository.findAll<QuestionDoc>(
            { section_id: sectionId, status: 1 },
            options
        );
    }

    async getGroupedQuestionsByAssessment(assessmentId: string): Promise<any[]> {
        // This would require MongoDB aggregation
        // For now, return a basic implementation
        // You'll need to implement the complex aggregation in the repository
        return this.sectionRepository.aggregatePipeline([
            {
                $match: {
                    assessment_id: assessmentId,
                    deletedAt: null,
                    deleted: false
                }
            },
            {
                $lookup: {
                    from: 'questions',
                    localField: '_id',
                    foreignField: 'section_id',
                    as: 'questions',
                    pipeline: [
                        {
                            $match: {
                                deletedAt: null,
                                deleted: false,
                                assessment_id: assessmentId
                            }
                        },
                        { $sort: { order: 1 } }
                    ]
                }
            },
            {
                $project: {
                    _id: '$_id',
                    section_name: '$name',
                    section_description: '$description',
                    section_order: '$order',
                    status: '$status',
                    questions: '$questions'
                }
            },
            {
                $sort: { section_order: 1 }
            }
        ]);
    }

    async getMaxOrderForSection(sectionId: string): Promise<number> {
        const result = await this.questionRepository.findOne<QuestionDoc>(
            { section_id: sectionId, deleted: false },
            { order: { order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.DESC } }
        );

        return result ? (result.order + 1) : 1;
    }

    // New methods to implement the required functionality
    async getSectionsWithQuestionsAndAnswers(assessmentId: string, assessmentReportId: string): Promise<any> {
        try {
            // Step 1: Match all sections with their questions and answers, excluding child questions from main questions
            const assessmentObjectId = assessmentId;
            const assessmentReportObjectId = assessmentReportId;
            const sections = await this.sectionRepository.aggregatePipeline([
                { $sort: { order: 1 } },
                {
                    $match: {
                        assessment_id: assessmentObjectId,
                        // status: 1,
                        // deletedAt: null
                    },
                },
                {
                    $lookup: {
                        from: "assessments",
                        localField: "assessment_id",
                        foreignField: "_id",
                        as: "assessmentDetails"
                    }
                },
                {
                    $unwind: "$assessmentDetails"
                },
                {
                    $lookup: {
                        from: "questions",
                        let: { sectionId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$section_id", "$$sectionId"] },
                                            {
                                                $eq: ["$assessment_id", assessmentObjectId]
                                            },
                                            { $eq: ["$status", 1] },
                                            { $eq: ["$deletedAt", null] },
                                            // { $eq: ["$parent_question_id", null] },
                                        ]
                                    }
                                }
                            },
                            {
                                $lookup: {
                                    from: "question_answers",
                                    let: { questionId: "$_id" },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $and: [
                                                        { $eq: ["$question_id", "$$questionId"] },
                                                        {
                                                            $eq: ["$asessment_report_id", assessmentReportObjectId]
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    ],
                                    as: "answerDetails"
                                }
                            },
                            {
                                $unwind: {
                                    path: "$answerDetails",
                                    preserveNullAndEmptyArrays: true
                                }
                            },
                            {
                                $addFields: {
                                    value: { $ifNull: ["$answerDetails.value", null] }
                                }
                            },
                            {
                                $sort: { order: 1 },
                            }
                        ],
                        as: "questions"
                    }
                },
                {
                    $match: {
                        $expr: { $gt: [{ $size: "$questions" }, 0] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        assessment_name: { $first: "$assessmentDetails.name" },
                        assessment_description: { $first: "$assessmentDetails.description" },
                        assessment_show_score_calculation: { $first: "$assessmentDetails.show_score_calculation" },
                        assessment_additional_description: { $first: "$assessmentDetails.additional_description" },
                        sections: {
                            $push: {
                                _id: "$_id",
                                name: "$name",
                                description: "$description",
                                questions: "$questions", // Include only parent questions
                                order: "$order"
                            }
                        }
                    }
                },
                {
                    $sort: { "sections.order": 1 }
                },
                {
                    $project: {
                        _id: 0,
                        assessment_name: 1,
                        assessment_description: 1,
                        assessment_show_score_calculation: 1,
                        assessment_additional_description: 1,
                        sections: 1
                    }
                }
            ]);

            // Step 2: Handle child questions
            const childQuestions = await this.sectionRepository.aggregatePipeline([
                {
                    $match: {
                        assessment_id: assessmentObjectId,
                        status: 1,
                        deletedAt: null
                    }
                },
                {
                    $lookup: {
                        from: "questions",
                        let: { sectionId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$section_id", "$$sectionId"] },
                                            {
                                                $eq: ["$assessment_id", assessmentObjectId]
                                            },
                                            { $eq: ["$status", 1] },
                                            { $eq: ["$deletedAt", null] },
                                            // { $ne: ["$parent_question_id", null] }
                                        ]
                                    }
                                }
                            },
                            {
                                $lookup: {
                                    from: "question_answers",
                                    let: { questionId: "$_id" },
                                    pipeline: [
                                        {
                                            $match: {
                                                $expr: {
                                                    $and: [
                                                        { $eq: ["$question_id", "$$questionId"] },
                                                        {
                                                            $eq: ["$asessment_report_id", assessmentReportObjectId]
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    ],
                                    as: "answerDetails"
                                }
                            },
                            {
                                $unwind: {
                                    path: "$answerDetails",
                                    preserveNullAndEmptyArrays: true
                                }
                            },
                            {
                                $addFields: {
                                    value: { $ifNull: ["$answerDetails.value", null] }
                                }
                            },
                            {
                                $sort: { order: 1 }
                            }
                        ],
                        as: "childQuestions"
                    }
                },
                {
                    $unwind: "$childQuestions"
                },
                {
                    $group: {
                        _id: "$childQuestions.parent_question_id", // Group by parent_question_id
                        childQuestions: { $push: "$childQuestions" }
                    }
                }
            ]);

            const allSections = await this.sectionRepository.aggregatePipeline([
                {
                    $match: {
                        assessment_id: assessmentObjectId,
                        status: 1,
                        deletedAt: null
                    }
                },
                {
                    $project: {
                        _id: 1,
                        name: 1,
                        order: 1,
                        description: 1
                    }
                },
                {
                    $sort: { order: 1 }
                }
            ]);

            // Step 3: Combine the parent and child questions
            const result: any = sections.length > 0 ? sections[0] : null;
            if (result) {
                result.allSections = allSections;

                // Merge child questions under their respective parent question
                if (result?.sections && (result.sections as Array<any>).length > 0) {
                    (result.sections as Array<any>).forEach((section: any) => {
                        if (section?.questions) {
                            section.questions.forEach((question: any) => {
                                // Find child questions that belong to this question
                                const matchingChildQuestions: any = childQuestions.find((child: any) =>
                                    child?._id?.toString() === question?._id?.toString()
                                );
                                if (matchingChildQuestions) {
                                    question.childQuestions = matchingChildQuestions.childQuestions;
                                }
                            });
                        }
                    });
                }
            }

            return result;
        } catch (error) {
            console.error("getSectionsWithQuestionsAndAnswers catch >>>> ", error);
            throw new Error(`getSectionsWithQuestionsAndAnswers catch >>>> ${error.message}`);
        }
    }

    async getQuestionByAssessmentId(assessment_id: string, asessment_report_id: string): Promise<any> {
        return await this.getSectionsWithQuestionsAndAnswers(assessment_id, asessment_report_id);
    }
}
