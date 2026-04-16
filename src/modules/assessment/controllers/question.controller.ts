import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    UseGuards,
    NotFoundException,
    InternalServerErrorException,
    BadRequestException,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { QuestionService } from '@modules/assessment/services/question.service';
import { QuestionCreateDto } from '@modules/assessment/dtos/question.create.dto';
import { QuestionUpdateDto } from '@modules/assessment/dtos/question.update.dto';
import {
    QuestionAdminCreateDoc,
    QuestionAdminDeleteDoc,
    QuestionAdminGetDoc,
    QuestionAdminListDoc,
    QuestionAdminUpdateDoc,
} from '../docs/assessment.admin.doc';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { PermissionGuard } from '@modules/role/guards/permission.guard';
import { Permission } from '@modules/role/decorators/permission.decorator';
import { PaginationService } from '@common/pagination/services/pagination.service';
import {
    Response,
    ResponsePaging,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import {
    PaginationQuery,
    PaginationQueryFilterInEnum,
} from '@common/pagination/decorators/pagination.decorator';
import {
    QUESTION_DEFAULT_AVAILABLE_SEARCH,
    QUESTION_DEFAULT_STATUS,
} from '@modules/assessment/constants/assessment.list.constant';
import { ENUM_QUESTION_STATUS } from '@modules/assessment/enums/assessment.enum';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import { AssessmentService } from '../services/assessment.service';
import { QuestionAnswerService } from '@modules/assessment/services/question-answer.service';
import { SectionService } from '../services/section.service';
import { BulkUpdateOrderDto } from '@modules/assessment/dtos/bulk-update-order.dto';
import { IUnifiedAuthJwtAccessTokenPayload } from '@modules/auth/interfaces/auth.unified.interface';

@ApiTags('modules.admin.questions')
@Controller({
    version: '1',
    path: '/questions',
})
export class QuestionController {
    constructor(
        private readonly assessmentService: AssessmentService,
        private readonly sectionService: SectionService,
        private readonly questionService: QuestionService,
        private readonly paginationService: PaginationService,
        private readonly questionAnswerService: QuestionAnswerService,) { }

    @Post('/create')
    @QuestionAdminCreateDoc()
    @Response('question.create')
    @Permission('assessment', 'can_create')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'tenant_id', required: false })
    async create(
        @Body() createDto: QuestionCreateDto,
        @AuthJwtPayload('tenantId') jwttenantId: string | null,
        @Query('tenant_id') querytenantId?: string
    ): Promise<IResponse<any>> {
        const data: any = { ...createDto };
        const tenantId = querytenantId || jwttenantId;

        if (tenantId) {
            // Tenant connection removed - using central database only
            if (data.assessment_id) {
                const assessment = await this.assessmentService.findOneById(data.assessment_id?.toString());
                if (!assessment) {
                    throw new NotFoundException({
                        statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                        message: 'assessment.error.notFound',
                    });
                }
                data.assessment_id = data.assessment_id;
            }
            if (data.section_id) {
                const section = await this.sectionService.findOneById(data.section_id?.toString());
                if (!section) {
                    throw new NotFoundException({
                        statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                        message: 'section.error.notFound',
                    });
                }
                data.section_id = data.section_id;
            }
            if (data.parent_question_id) {
                const parentQuestion = await this.questionService.findOneById(data.parent_question_id?.toString());
                if (!parentQuestion) {
                    throw new NotFoundException({
                        statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                        message: 'question.error.notFound',
                    });
                }
                data.parent_question_id = data.parent_question_id;
            }

            const created = await this.questionService.create(data);
            return { data: created };
        }

        // Use default services for master database
        if (data.assessment_id) {
            const assessment = await this.assessmentService.findOneById(
                data.assessment_id
            );
            if (!assessment) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'assessment.error.notFound',
                });
            }
            data.assessment_id = data.assessment_id;
        }
        if (data.section_id) {
            const section = await this.sectionService.findOneById(
                data.section_id
            );
            if (!section) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'section.error.notFound',
                });
            }
            data.section_id = data.section_id;
        }
        if (data.parent_question_id) {
            const parentQuestion = await this.questionService.findOneById(
                data.parent_question_id
            );
            if (!parentQuestion) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'question.error.notFound',
                });
            }
            data.parent_question_id = data.parent_question_id;
        }

        const created = await this.questionService.create(data);
        return { data: created };
    }

    @Get('/list')
    @QuestionAdminListDoc()
    @ResponsePaging('question.list')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async findAll(
        @PaginationQuery({
            availableSearch: QUESTION_DEFAULT_AVAILABLE_SEARCH,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        // @PaginationQueryFilterInEnum(
        //     'status',
        //     QUESTION_DEFAULT_STATUS,
        //     ENUM_ASSESSMENT_STATUS
        // )
        // status: Record<string, any>
        @Query('status') status: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponsePaging<any>> {
        let statusValue: number = 1;
        if (status === 'ACTIVE') {
            statusValue = ENUM_QUESTION_STATUS.ACTIVE;
        } else if (status === 'INACTIVE') {
            statusValue = ENUM_QUESTION_STATUS.INACTIVE;
        } else {
            status = null;
        }
        const find: Record<string, any> = {
            ..._search,
            ...(status !== null && status !== '' && status !== undefined
                ? { status: { $eq: statusValue } }
                : {}),
        };

        if (tenantId) {
            // Tenant connection removed - using central database only
            const questions = await this.questionService.findAll(find, {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            });

            const total: number = await this.questionService.getTotal(find);
            const totalPage: number = this.paginationService.totalPage(
                total,
                _limit
            );

            return {
                _pagination: { total, totalPage },
                data: questions,
            };
        }

        // Use default service for master database
        const questions = await this.questionService.findAll(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        const total: number = await this.questionService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        return {
            _pagination: { total, totalPage },
            data: questions,
        };
    }

    @Get('/get/:id')
    @QuestionAdminGetDoc()
    @Response('question.get')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async findOne(
        @Param('id', RequestRequiredPipe) id: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const question = await this.questionService.findOneById(id);
            if (!question) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'question.error.notFound',
                });
            }
            return { data: question };
        }

        // Use default service for master database
        const question = await this.questionService.findOneById(id);
        if (!question) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'question.error.notFound',
            });
        }
        return { data: question };
    }

    @Put('/update/:id')
    @QuestionAdminUpdateDoc()
    @Response('question.update')
    // @Permission('assessment', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async update(
        @Param('id', RequestRequiredPipe) id: string,
        @Body() updateDto: QuestionUpdateDto,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        let question;

        if (tenantId) {
            // Tenant connection removed - using central database only
            question = await this.questionService.findOneById(id);
            if (!question) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'question.error.notFound',
                });
            }

            const data: any = { ...updateDto };
            if (data.assessment_id) {
                const assessment = await this.assessmentService.findOneById(data.assessment_id);
                if (!assessment) {
                    throw new NotFoundException({
                        statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                        message: 'assessment.error.notFound',
                    });
                }
                data.assessment_id = data.assessment_id;
            }
            if (data.section_id) {
                const section = await this.sectionService.findOneById(data.section_id);
                if (!section) {
                    throw new NotFoundException({
                        statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                        message: 'section.error.notFound',
                    });
                }
                data.section_id = data.section_id;
            }
            if (data.parent_question_id) {
                const parentQuestion = await this.questionService.findOneById(data.parent_question_id);
                if (!parentQuestion) {
                    throw new NotFoundException({
                        statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                        message: 'question.error.notFound',
                    });
                }
                data.parent_question_id = data.parent_question_id;
            }

            const updated = await this.questionService.update(question, data);
            return { data: updated };
        }

        // Use default services for master database
        question = await this.questionService.findOneById(id);
        if (!question) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'question.error.notFound',
            });
        }

        const data: any = { ...updateDto };
        if (data.assessment_id) {
            const assessment = await this.assessmentService.findOneById(
                data.assessment_id
            );
            if (!assessment) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'assessment.error.notFound',
                });
            }
            data.assessment_id = data.assessment_id;
        }
        if (data.section_id) {
            const section = await this.sectionService.findOneById(
                data.section_id
            );
            if (!section) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'section.error.notFound',
                });
            }
            data.section_id = data.section_id;
        }
        if (data.parent_question_id) {
            const parentQuestion = await this.questionService.findOneById(
                data.parent_question_id
            );
            if (!parentQuestion) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'question.error.notFound',
                });
            }
            data.parent_question_id = data.parent_question_id;
        }

        const updated = await this.questionService.update(question, data);
        return { data: updated };
    }

    @Delete('/delete/:id')
    @QuestionAdminDeleteDoc()
    @Response('question.delete')
    // @Permission('assessment', 'can_delete')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async delete(
        @Param('id', RequestRequiredPipe) id: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<void> {
        let question;

        if (tenantId) {
            // Tenant connection removed - using central database only
            question = await this.questionService.findOneById(id);
            if (!question) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'question.error.notFound',
                });
            }

            // Check if question has related answers
            const answersCount = await this.questionAnswerService.getTotal({
                question_id: question._id,
            });

            if (answersCount > 0) {
                // Soft delete if has related data
                await this.questionService.softDelete(question);
            } else {
                // Hard delete if no related data
                await this.questionService.delete(question);
            }
            return;
        }

        // Use default services for master database
        question = await this.questionService.findOneById(id);
        if (!question) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'question.error.notFound',
            });
        }

        // Check if question has related answers
        const answersCount = await this.questionAnswerService.getTotal({
            question_id: question._id,
        });

        if (answersCount > 0) {
            // Soft delete if has related data
            await this.questionService.softDelete(question);
        } else {
            // Hard delete if no related data
            await this.questionService.delete(question);
        }
    }

    @Get('/by-section')
    @Response('question.getByAssessment')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    @ApiBearerAuth('accessToken')
    async getQuestionsByAssessment(
        @Query('section_id', RequestRequiredPipe) sectionId: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const questions = await this.questionService.findAll({
                section_id: sectionId,
                status: 1,
            });
            return { data: questions };
        }
        const questions = await this.questionService.findAll({
            section_id: sectionId,
            status: 1,
        });
        return { data: questions };
    }

    @Get('/grouped-by-assessment')
    @ApiBearerAuth('accessToken')
    @Response('question.getGroupedByAssessment')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async getGroupedQuestionsByAssessment(
        @Query('assessment_id', RequestRequiredPipe) assessmentId: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        try {
            if (tenantId) {
                // Tenant connection removed - using central database only
            const questions = await this.questionService.getGroupedQuestionsByAssessment(
                    assessmentId
                );
                return { data: questions };
            }
            const groupedQuestions =
                await this.questionService.getGroupedQuestionsByAssessment(
                    assessmentId
                );
            return { data: groupedQuestions };
        } catch (err: unknown) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @Put('/bulk-update-order')
    @ApiBearerAuth('accessToken')
    @Response('question.bulkUpdateOrder')
    // @Permission('assessment', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async bulkUpdateOrder(
        @Body() bulkUpdateDto: BulkUpdateOrderDto,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        const { bulkItems, questionOrder, sectionOrder } = bulkUpdateDto;

        if (!bulkItems || bulkItems.length === 0) {
            throw new BadRequestException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'No updates provided',
            });
        }

        const bulkOperations = bulkItems.map(item => ({
            updateOne: {
                filter: { _id: item._id },
                update: { $set: { order: item.order } },
            },
        }));

        let result;

        if (tenantId) {
            // Tenant connection removed - using central database only
            if (questionOrder) {
                result = await this.questionService.bulkWrite(bulkOperations);
            } else if (sectionOrder) {
                result = await this.sectionService.bulkWrite(bulkOperations);
            } else {
                throw new BadRequestException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'Please specify questionOrder or sectionOrder',
                });
            }
            return { data: result };
        }
        if (questionOrder) {
            result = await this.questionService.bulkWrite(bulkOperations);
        } else if (sectionOrder) {
            result = await this.sectionService.bulkWrite(bulkOperations);
        } else {
            throw new BadRequestException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'Please specify questionOrder or sectionOrder',
            });
        }

        return { data: result };
    }

    @Get('/by-assessment-with-answers')
    @ApiBearerAuth('accessToken')
    @Response('question.getByAssessmentWithAnswers')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async getQuestionByAssessmentId(
        @Query('assessment_id', RequestRequiredPipe) assessment_id: string,
        @Query('asessment_report_id', RequestRequiredPipe) asessment_report_id: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        try {
            if (tenantId) {
                // Tenant connection removed - using central database only
            const result = await this.questionService.getQuestionByAssessmentId(
                    assessment_id,
                    asessment_report_id
                );
                return { data: result };
            }

            const result = await this.questionService.getQuestionByAssessmentId(
                assessment_id,
                asessment_report_id
            );
            return { data: result };
        } catch (err: unknown) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @Get('/sections-with-questions-and-answers')
    @ApiBearerAuth('accessToken')
    @Response('question.getSectionsWithQuestionsAndAnswers')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async getSectionsWithQuestionsAndAnswers(
        @Query('assessment_id', RequestRequiredPipe) assessment_id: string,
        @Query('asessment_report_id', RequestRequiredPipe) asessment_report_id: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        try {
            if (tenantId) {
                // Tenant connection removed - using central database only
            const result = await this.questionService.getSectionsWithQuestionsAndAnswers(
                    assessment_id,
                    asessment_report_id
                );
                return { data: result };
            }

            const result = await this.questionService.getSectionsWithQuestionsAndAnswers(
                assessment_id,
                asessment_report_id
            );
            return { data: result };
        } catch (err: unknown) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }
}
