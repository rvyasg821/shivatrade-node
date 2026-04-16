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
    Query,
} from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { QuestionAnswerService } from '@modules/assessment/services/question-answer.service';
import { QuestionAnswerCreateDto } from '@modules/assessment/dtos/question-answer.create.dto';
import { QuestionAnswerUpdateDto } from '@modules/assessment/dtos/question-answer.update.dto';
import {
    QuestionAnswerAdminCreateDoc,
    QuestionAnswerAdminDeleteDoc,
    QuestionAnswerAdminGetDoc,
    QuestionAnswerAdminListDoc,
    QuestionAnswerAdminUpdateDoc,
} from '../docs/assessment.admin.doc';
import { Permission } from '@modules/role/decorators/permission.decorator';
import { PermissionGuard } from '@modules/role/guards/permission.guard';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
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
    QUESTION_ANSWER_DEFAULT_AVAILABLE_SEARCH,
    QUESTION_ANSWER_DEFAULT_STATUS,
} from '@modules/assessment/constants/assessment.list.constant';
import { ENUM_QUESTION_ANSWER_STATUS } from '@modules/assessment/enums/assessment.enum';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import { AssessmentService } from '../services/assessment.service';
import { SectionService } from '../services/section.service';
import { QuestionService } from '../services/question.service';
import { IUnifiedAuthJwtAccessTokenPayload } from '@modules/auth/interfaces/auth.unified.interface';

@ApiTags('modules.admin.question-answers')
@Controller({
    version: '1',
    path: '/question-answers',
})
export class QuestionAnswerController {
    constructor(
        private readonly assessmentService: AssessmentService,
        private readonly sectionService: SectionService,
        private readonly questionService: QuestionService,
        private readonly questionAnswerService: QuestionAnswerService,
        private readonly paginationService: PaginationService,) { }

    @Post('/create')
    @QuestionAnswerAdminCreateDoc()
    @Response('questionAnswer.create')
    // @Permission('assessment', 'can_create')
    // @UseGuards(PermissionGuard)
    // @AuthJwtAccessProtected()
    @ApiQuery({ name: 'tenant_id', required: false })
    async create(
        @Body() createDto: QuestionAnswerCreateDto,
        @Query('tenant_id') tenantId?: string
    ): Promise<IResponse<any>> {
        const data: any = { ...createDto };

        if (tenantId) {
            // Tenant connection removed - using central database only
            const data: any = { ...createDto };
            if (data.company_id) {
                data.company_id = undefined;
            }
            if (data.asessment_report_id) {
                data.asessment_report_id = data.asessment_report_id;
            }
            if (data.user_id) {
                data.user_id = data.user_id;
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
            if (data.question_id) {
                const question = await this.questionService.findOneById(data.question_id);
                if (!question) {
                    throw new NotFoundException({
                        statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                        message: 'question.error.notFound',
                    });
                }
                data.question_id = data.question_id;
                data.question_data = question;
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

            const created = await this.questionAnswerService.create(data);
            return { data: created };
        }

        // Use default services for master database
        if (data.company_id) {
            // data.company_id = data.company_id;
            data.company_id = undefined;
        }
        if (data.asessment_report_id) {
            data.asessment_report_id = data.asessment_report_id;
        }
        if (data.user_id) {
            data.user_id = data.user_id;
        }
        if (data.section_id) {
            const section = await this.sectionService.findOneById(
                data.section_id
            )
            if (!section) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'section.error.notFound',
                });
            }
            data.section_id = data.section_id;
        }
        if (data.question_id) {
            const question = await this.questionService.findOneById(
                data.question_id
            )
            if (!question) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'question.error.notFound',
                });
            }
            data.question_id = data.question_id;
            data.question_data = question;
        }
        if (data.parent_question_id) {
            const parentQuestion = await this.questionService.findOneById(
                data.parent_question_id
            )
            if (!parentQuestion) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'question.error.notFound',
                });
            }
            data.parent_question_id = data.parent_question_id;
        }

        const created = await this.questionAnswerService.create(data);
        return { data: created };
    }

    @Get('/list')
    @QuestionAnswerAdminListDoc()
    @ResponsePaging('questionAnswer.list')
    @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async findAll(
        @PaginationQuery({
            availableSearch: QUESTION_ANSWER_DEFAULT_AVAILABLE_SEARCH,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        // @PaginationQueryFilterInEnum(
        //     'status',
        //     QUESTION_ANSWER_DEFAULT_STATUS,
        //     ENUM_ASSESSMENT_STATUS
        // )
        // status: Record<string, any>
        @Query('status') status: string,
        @AuthJwtPayload() payload: IUnifiedAuthJwtAccessTokenPayload,
    ): Promise<IResponsePaging<any>> {
        const tenantId = payload.tenantId;
        let statusValue: number = 1;
        if (status === 'ACTIVE') {
            statusValue = ENUM_QUESTION_ANSWER_STATUS.ACTIVE;
        } else if (status === 'INACTIVE') {
            statusValue = ENUM_QUESTION_ANSWER_STATUS.INACTIVE;
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
            const questionAnswers = await this.questionAnswerService.findAll(find, {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            });

            const total: number = await this.questionAnswerService.getTotal(find);
            const totalPage: number = this.paginationService.totalPage(
                total,
                _limit
            );

            return {
                _pagination: { total, totalPage },
                data: questionAnswers,
            };
        }

        // Use default service for master database
        const questionAnswers = await this.questionAnswerService.findAll(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        const total: number = await this.questionAnswerService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        return {
            _pagination: { total, totalPage },
            data: questionAnswers,
        };
    }

    @Get('/get/:id')
    @QuestionAnswerAdminGetDoc()
    @Response('questionAnswer.get')
    @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async findOne(
        @Param('id', RequestRequiredPipe) id: string,
        @AuthJwtPayload() payload: IUnifiedAuthJwtAccessTokenPayload,
    ): Promise<IResponse<any>> {
        const tenantId = payload.tenantId;
        if (tenantId) {
            // Tenant connection removed - using central database only
            const questionAnswer = await this.questionAnswerService.findOneById(id);
            if (!questionAnswer) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'questionAnswer.error.notFound',
                });
            }
            return { data: questionAnswer };
        }

        // Use default service for master database
        const questionAnswer = await this.questionAnswerService.findOneById(id);
        if (!questionAnswer) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'questionAnswer.error.notFound',
            });
        }
        return { data: questionAnswer };
    }

    @Put('/update/:id')
    @QuestionAnswerAdminUpdateDoc()
    @Response('questionAnswer.update')
    @Permission('assessment', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async update(
        @Param('id', RequestRequiredPipe) id: string,
        @Body() updateDto: QuestionAnswerUpdateDto,
        @AuthJwtPayload() payload: IUnifiedAuthJwtAccessTokenPayload,
    ): Promise<IResponse<any>> {
        const tenantId = payload.tenantId;
        let questionAnswer;

        if (tenantId) {
            // Tenant connection removed - using central database only
            questionAnswer = await this.questionAnswerService.findOneById(id);
            if (!questionAnswer) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'questionAnswer.error.notFound',
                });
            }

            const data: any = { ...updateDto };
            if (data.company_id) {
                data.company_id = data.company_id;
            }
            if (data.asessment_report_id) {
                data.asessment_report_id = data.asessment_report_id;
            }
            if (data.user_id) {
                data.user_id = data.user_id;
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
            if (data.question_id) {
                const question = await this.questionService.findOneById(data.question_id);
                if (!question) {
                    throw new NotFoundException({
                        statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                        message: 'question.error.notFound',
                    });
                }
                data.question_id = data.question_id;
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

            const updated = await this.questionAnswerService.update(questionAnswer, data);
            return { data: updated };
        }

        // Use default services for master database
        questionAnswer = await this.questionAnswerService.findOneById(id);
        if (!questionAnswer) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'questionAnswer.error.notFound',
            });
        }

        const data: any = { ...updateDto };
        if (data.company_id) {
            data.company_id = data.company_id;
        }
        if (data.asessment_report_id) {
            data.asessment_report_id = data.asessment_report_id;
        }
        if (data.user_id) {
            data.user_id = data.user_id;
        }
        if (data.section_id) {
            const section = await this.sectionService.findOneById(
                data.section_id
            )
            if (!section) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'section.error.notFound',
                });
            }
            data.section_id = data.section_id;
        }
        if (data.question_id) {
            const question = await this.questionService.findOneById(
                data.question_id
            )
            if (!question) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'question.error.notFound',
                });
            }
            data.question_id = data.question_id;
        }
        if (data.parent_question_id) {
            const parentQuestion = await this.questionService.findOneById(
                data.parent_question_id
            )
            if (!parentQuestion) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'question.error.notFound',
                });
            }
            data.parent_question_id = data.parent_question_id;
        }

        const updated = await this.questionAnswerService.update(
            questionAnswer,
            data
        );
        return { data: updated };
    }

    @Delete('/delete/:id')
    @QuestionAnswerAdminDeleteDoc()
    @Response('questionAnswer.delete')
    @Permission('assessment', 'can_delete')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async delete(
        @Param('id', RequestRequiredPipe) id: string,
        @AuthJwtPayload() payload: IUnifiedAuthJwtAccessTokenPayload,
    ): Promise<void> {
        const tenantId = payload.tenantId;
        let questionAnswer;

        if (tenantId) {
            // Tenant connection removed - using central database only
            questionAnswer = await this.questionAnswerService.findOneById(id);
            if (!questionAnswer) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'questionAnswer.error.notFound',
                    _error: 'NotFoundException',
                });
            }

            await this.questionAnswerService.delete(questionAnswer);
            return;
        }

        // Use default service for master database
        questionAnswer = await this.questionAnswerService.findOneById(id);
        if (!questionAnswer) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'questionAnswer.error.notFound',
            });
        }

        await this.questionAnswerService.delete(questionAnswer);
    }
}
