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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SectionService } from '@modules/assessment/services/section.service';
import { SectionCreateDto } from '@modules/assessment/dtos/section.create.dto';
import { SectionUpdateDto } from '@modules/assessment/dtos/section.update.dto';
import {
    SectionAdminCreateDoc,
    SectionAdminDeleteDoc,
    SectionAdminGetDoc,
    SectionAdminListDoc,
    SectionAdminUpdateDoc,
    SectionAdminUpdateQuestionsOrderDoc,
    SectionAdminGetQuestionsOrderDoc,
    SectionAdminDropdownDoc,
} from '../docs/assessment.admin.doc';
import { Permission } from '@modules/role/decorators/permission.decorator';
import { PermissionGuard } from '@modules/role/guards/permission.guard';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
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
    SECTION_DEFAULT_AVAILABLE_SEARCH,
    SECTION_DEFAULT_STATUS,
} from '@modules/assessment/constants/assessment.list.constant';
import { ENUM_SECTION_STATUS } from '@modules/assessment/enums/assessment.enum';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import { AssessmentService } from '../services/assessment.service';
import { QuestionService } from '@modules/assessment/services/question.service';
import { QuestionOrderUpdateDto } from '@modules/assessment/dtos/question-order-update.dto';
import { QuestionOrderListResponseDto } from '../dtos/question-order-list-response.dto';
import { SectionDropdownDto } from '../dtos/section-dropdown.dto';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';
import { IUnifiedAuthJwtAccessTokenPayload } from '@modules/auth/interfaces/auth.unified.interface';

@ApiTags('modules.admin.sections')
@Controller({
    version: '1',
    path: '/sections',
})
export class SectionController {
    constructor(
        private readonly sectionService: SectionService,
        private readonly assessmentService: AssessmentService,
        private readonly paginationService: PaginationService,
        private readonly questionService: QuestionService,) { }

    @Post('/create')
    @SectionAdminCreateDoc()
    @Response('section.create')
    // @Permission('assessment', 'can_create')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async create(
        @Body() createDto: SectionCreateDto,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        const data: any = { ...createDto };
        if (data.assessment_id) {
            data.assessment_id = data.assessment_id;
        }

        if (tenantId) {
            // Tenant connection removed - using central database only
            const assessment = await this.assessmentService.findOneById(data.assessment_id);
            if (!assessment) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'assessment.error.notFound',
                });
            }
            const created = await this.sectionService.create(data);
            return { data: created };
        }

        // Use default services for master database
        const assessment = await this.assessmentService.findOneById(
            data.assessment_id
        );
        if (!assessment) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'assessment.error.notFound',
            });
        }
        const created = await this.sectionService.create(data);
        return { data: created };
    }

    @Get('/list')
    @SectionAdminListDoc()
    @ResponsePaging('section.list')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async findAll(
        @PaginationQuery({
            availableSearch: SECTION_DEFAULT_AVAILABLE_SEARCH,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponsePaging<any>> {
        let statusValue: number = 1;
        if (status === 'ACTIVE') {
            statusValue = ENUM_SECTION_STATUS.ACTIVE;
        } else if (status === 'INACTIVE') {
            statusValue = ENUM_SECTION_STATUS.INACTIVE;
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
            const sections = await this.sectionService.findAll(find, {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            });

            const total: number = await this.sectionService.getTotal(find);
            const totalPage: number = this.paginationService.totalPage(
                total,
                _limit
            );

            return {
                _pagination: { total, totalPage },
                data: sections,
            };
        }

        // Use default service for master database
        const sections = await this.sectionService.findAll(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        const total: number = await this.sectionService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        return {
            _pagination: { total, totalPage },
            data: sections,
        };
    }

    @Get('/get/:id')
    @SectionAdminGetDoc()
    @Response('section.get')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async findOne(
        @Param('id', RequestRequiredPipe) id: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const section = await this.sectionService.findOneById(id);
            if (!section) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'section.error.notFound',
                });
            }
            return { data: section };
        }

        // Use default service for master database
        const section = await this.sectionService.findOneById(id);
        if (!section) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'section.error.notFound',
            });
        }
        return { data: section };
    }

    @Put('/update/:id')
    @SectionAdminUpdateDoc()
    @Response('section.update')
    // @Permission('assessment', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async update(
        @Param('id', RequestRequiredPipe) id: string,
        @Body() updateDto: SectionUpdateDto,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        let section;
        let assessment;

        if (tenantId) {
            // Tenant connection removed - using central database only
            section = await this.sectionService.findOneById(id);
            if (!section) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'section.error.notFound',
                });
            }

            const data: any = { ...updateDto };
            if (data.assessment_id) {
                assessment = await this.assessmentService.findOneById(data.assessment_id);
                if (!assessment) {
                    throw new NotFoundException({
                        statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                        message: 'assessment.error.notFound',
                    });
                }
                data.assessment_id = data.assessment_id;
            }

            const updated = await this.sectionService.update(section, data);
            return { data: updated };
        }

        // Use default services for master database
        section = await this.sectionService.findOneById(id);
        if (!section) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'section.error.notFound',
            });
        }

        const data: any = { ...updateDto };
        if (data.assessment_id) {
            assessment = await this.assessmentService.findOneById(
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

        const updated = await this.sectionService.update(section, data);
        return { data: updated };
    }

    @Delete('/delete/:id')
    @SectionAdminDeleteDoc()
    @Response('section.delete')
    // @Permission('assessment', 'can_delete')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async delete(
        @Param('id', RequestRequiredPipe) id: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<void> {
        let section;

        if (tenantId) {
            // Tenant connection removed - using central database only
            section = await this.sectionService.findOneById(id);
            if (!section) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'section.error.notFound',
                });
            }

            // Check if section has related questions
            const questionsCount = await this.questionService.getTotal({
                section_id: section._id,
            });

            if (questionsCount > 0) {
                // Soft delete if has related data
                await this.sectionService.softDelete(section);
            } else {
                // Hard delete if no related data
                await this.sectionService.delete(section);
            }
            return;
        }

        // Use default services for master database
        section = await this.sectionService.findOneById(id);
        if (!section) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'section.error.notFound',
            });
        }

        // Check if section has related questions
        const questionsCount = await this.questionService.getTotal({
            section_id: section._id,
        });

        if (questionsCount > 0) {
            // Soft delete if has related data
            await this.sectionService.softDelete(section);
        } else {
            // Hard delete if no related data
            await this.sectionService.delete(section);
        }
    }

    @Get('/by-assessment')
    @Response('section.getByAssessment')
    @ApiBearerAuth('accessToken')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async getSectionsByAssessment(
        @Query('assessment_id', RequestRequiredPipe) assessmentId: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const sections = await this.sectionService.findAll({
                assessment_id: assessmentId,
                status: 1,
            });
            return { data: sections };
        }
        const sections = await this.sectionService.findAll({
            assessment_id: assessmentId,
            status: 1,
        });
        return { data: sections };
    }

    @Put('/update-questions-order/:sectionId')
    @SectionAdminUpdateQuestionsOrderDoc()
    @Response('section.updateQuestionsOrder')
    // @Permission('assessment', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async updateQuestionsOrder(
        @Param('sectionId', RequestRequiredPipe) sectionId: string,
        @Body() updateDto: QuestionOrderUpdateDto,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const section = await this.sectionService.findOneById(sectionId);
            if (!section) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'section.error.notFound',
                });
            }
            const questionIds = updateDto.questions.map(item => item.questionId);
            const questions = await this.questionService.findAll({
                _id: { $in: questionIds.map(id => id) },
                section_id: section._id,
            });

            if (questions.length !== questionIds.length) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'question.error.notFound',
                });
            }

            const operations = updateDto.questions.map(item => ({
                updateOne: {
                    filter: { _id: item.questionId },
                    update: { $set: { order: item.order } },
                },
            }));

            await this.questionService.bulkWrite(operations);
            return { data: { success: true } };
        }
        const section = await this.sectionService.findOneById(sectionId);
        if (!section) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'section.error.notFound',
            });
        }

        const questionIds = updateDto.questions.map(item => item.questionId);
        const questions = await this.questionService.findAll({
            _id: { $in: questionIds.map(id => id) },
            section_id: section._id,
        });

        if (questions.length !== questionIds.length) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'question.error.notFound',
            });
        }

        const operations = updateDto.questions.map(item => ({
            updateOne: {
                filter: { _id: item.questionId },
                update: { $set: { order: item.order } },
            },
        }));

        await this.questionService.bulkWrite(operations);

        return { data: { success: true } };
    }

    @Get('/questions-order/:sectionId')
    @SectionAdminGetQuestionsOrderDoc()
    @Response('section.getQuestionsOrder')
    // @Permission('section', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async getQuestionsOrder(
        @Param('sectionId', RequestRequiredPipe) sectionId: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<QuestionOrderListResponseDto[]>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const section = await this.sectionService.findOneById(sectionId);
            if (!section) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'section.error.notFound',
                });
            }

            const questions = await this.questionService.findAll(
                { section_id: sectionId },
                {
                    order: {
                        order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC,
                    },
                }
            );

            const orderData = questions.map(question => ({
                questionId: question._id.toString(),
                order: question.order,
            }));

            return { data: orderData };
        }
        // Validate that the section exists
        const section = await this.sectionService.findOneById(sectionId);
        if (!section) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'section.error.notFound',
            });
        }

        const questions = await this.questionService.findAll(
            { section_id: sectionId },
            { order: { order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        );

        const orderData = questions.map(question => ({
            questionId: question._id.toString(),
            order: question.order,
        }));

        return { data: orderData };
    }

    @Get('/dropdown')
    @SectionAdminDropdownDoc()
    @Response('section.dropdown')
    // @Permission('section', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async getSectionDropdown(
        @AuthJwtPayload('tenantId') tenantId: string | null,
        @Query('assessment_id') assessmentId?: string
    ): Promise<IResponse<SectionDropdownDto[]>> {
        const filter: Record<string, any> = { status: 1 };

        if (assessmentId) {
            filter.assessment_id = assessmentId;
        }

        if (tenantId) {
            // Tenant connection removed - using central database only
            const sections = await this.sectionService.findAll(filter, {
                order: { name: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC },
            });
            const dropdownData = sections.map(section => ({
                _id: section._id.toString(),
                name: section.name,
            }));
            return { data: dropdownData };
        }

        const sections = await this.sectionService.findAll(filter, {
            order: { name: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC },
        });

        const dropdownData = sections.map(section => ({
            _id: section._id.toString(),
            name: section.name,
        }));

        return { data: dropdownData };
    }
}
