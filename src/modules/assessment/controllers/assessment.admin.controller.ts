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
import { ApiTags } from '@nestjs/swagger';
import { AssessmentService } from '@modules/assessment/services/assessment.service';
import { AssessmentCreateDto } from '@modules/assessment/dtos/assessment.create.dto';
import { AssessmentUpdateDto } from '@modules/assessment/dtos/assessment.update.dto';
import {
    AssessmentAdminListDoc,
    AssessmentAdminGetDoc,
    AssessmentAdminCreateDoc,
    AssessmentAdminUpdateDoc,
    AssessmentAdminDeleteDoc,
    AssessmentAdminUpdateSectionsOrderDoc,
    AssessmentAdminGetSectionsOrderDoc,
} from '@modules/assessment/docs/assessment.admin.doc';
import { AssessmentParsePipe } from '@modules/assessment/pipes/assessment.parse.pipe';
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
    ASSESSMENT_DEFAULT_AVAILABLE_SEARCH,
    ASSESSMENT_DEFAULT_STATUS,
} from '@modules/assessment/constants/assessment.list.constant';
import { AssessmentListResponseDto } from '@modules/assessment/dtos/assessment.list.response.dto';
import { ENUM_ASSESSMENT_STATUS } from '@modules/assessment/enums/assessment.enum';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import { AssessmentDoc } from '@modules/assessment/repository/entities/assessment.entity';
import { ENUM_ASSESSMENT_STATUS_CODE_ERROR } from '@modules/assessment/enums/assessment.status-code.enum';
import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import { SectionService } from '@modules/assessment/services/section.service';
import { SectionOrderUpdateDto } from '@modules/assessment/dtos/section-order-update.dto';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';
import { SectionOrderListResponseDto } from '@modules/assessment/dtos/section-order-list-response.dto';
import { AssessmentDropdownDoc } from '../docs/assessment.doc';
import { AssessmentDropdownDto } from '../dtos/assessment-dropdown.dto';
import { stat } from 'fs';
import { AssessmentOrderUpdateDto } from '../dtos/assessment-order-update.dto';
@ApiTags('modules.admin.assessment')
@Controller({
    version: '1',
    path: '/assessment',
})
export class AssessmentAdminController {
    constructor(
        private readonly assessmentService: AssessmentService,
        private readonly paginationService: PaginationService,
        private readonly sectionService: SectionService,) { }

    @Post('/create')
    @AssessmentAdminCreateDoc()
    @Response('assessment.create')
    // @Permission('assessment', 'can_create')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async create(
        @Body() createDto: AssessmentCreateDto,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const created = await this.assessmentService.create(createDto);
            return { data: created };
        }

        // Use default service for master database
        const created = await this.assessmentService.create(createDto);
        return { data: created };
    }

    @Get('/list')
    @AssessmentAdminListDoc()
    @ResponsePaging('assessment.list')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async findAll(
        @PaginationQuery({
            availableSearch: ASSESSMENT_DEFAULT_AVAILABLE_SEARCH,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        // @PaginationQueryFilterInEnum(
        //     'status',
        //     ASSESSMENT_DEFAULT_STATUS,
        //     ENUM_ASSESSMENT_STATUS
        // )
        // status: Record<string, any>
        @Query('status') status: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponsePaging<AssessmentListResponseDto>> {
        let statusValue: number = 1;
        if (status === 'ACTIVE') {
            statusValue = ENUM_ASSESSMENT_STATUS.ACTIVE;
        } else if (status === 'INACTIVE') {
            statusValue = ENUM_ASSESSMENT_STATUS.INACTIVE;
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
            // If this company has a tenantId, copy master assessments to tenant database
            if (tenantId) {
                try {
                    // Tenant-specific assessment setup removed - using central database only
                    // Assessments now managed in central database only
                } catch (error) {
                    console.error(
                        `Failed to copy assessments to tenant ${tenantId}`,
                        error
                    );
                    // Don't fail the company creation if assessment copying fails
                }
            }

            // Tenant connection removed - using central database only
            const assessments = await this.assessmentService.findAll(find, {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            });

            const total: number = await this.assessmentService.getTotal(find);
            const totalPage: number = this.paginationService.totalPage(
                total,
                _limit
            );

            const mapped: AssessmentListResponseDto[] = assessments.map(
                assessment => ({
                    _id: assessment._id.toString(),
                    name: assessment.name,
                    description: assessment.description,
                    order: assessment.order,
                    status: assessment.status,
                    createdAt: assessment.createdAt,
                    updatedAt: assessment.updatedAt,
                })
            );

            return {
                _pagination: { total, totalPage },
                data: mapped,
            };
        }

        // Use default service for master database
        const assessments = await this.assessmentService.findAll(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        const total: number = await this.assessmentService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        const mapped: AssessmentListResponseDto[] = assessments.map(
            assessment => ({
                _id: assessment._id.toString(),
                name: assessment.name,
                description: assessment.description,
                order: assessment.order,
                status: assessment.status,
                createdAt: assessment.createdAt,
                updatedAt: assessment.updatedAt,
            })
        );

        return {
            _pagination: { total, totalPage },
            data: mapped,
        };
    }

    @Get('/get/:assessment')
    @AssessmentAdminGetDoc()
    @Response('assessment.get')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async findOne(
        @Param('assessment', RequestRequiredPipe)
        assessment: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const assessmentData = await this.assessmentService.findOne({
                _id: assessment,
                deleted: false,
            });
            return { data: assessmentData };
        } else {
            const assessmentData = await this.assessmentService.findOne({
                _id: assessment,
                deleted: false,
            });
            return { data: assessmentData };
        }
    }

    @Get('/tenant/list')
    @AssessmentAdminListDoc()
    @ResponsePaging('assessment.list')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async findTenantAll(
        @PaginationQuery({
            availableSearch: ASSESSMENT_DEFAULT_AVAILABLE_SEARCH,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponsePaging<AssessmentListResponseDto>> {
        let statusValue: number = 1;
        if (status === 'ACTIVE') {
            statusValue = ENUM_ASSESSMENT_STATUS.ACTIVE;
        } else if (status === 'INACTIVE') {
            statusValue = ENUM_ASSESSMENT_STATUS.INACTIVE;
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
            const assessments = await this.assessmentService.findAll(find, {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            });

            const total: number = await this.assessmentService.getTotal(find);
            const totalPage: number = this.paginationService.totalPage(
                total,
                _limit
            );

            const mapped: AssessmentListResponseDto[] = assessments.map(
                assessment => ({
                    _id: assessment._id.toString(),
                    name: assessment.name,
                    description: assessment.description,
                    order: assessment.order,
                    status: assessment.status,
                    createdAt: assessment.createdAt,
                    updatedAt: assessment.updatedAt,
                })
            );

            return {
                _pagination: { total, totalPage },
                data: mapped,
            };
        }

        // Use default service for master database
        const assessments = await this.assessmentService.findAll(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        const total: number = await this.assessmentService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        const mapped: AssessmentListResponseDto[] = assessments.map(
            assessment => ({
                _id: assessment._id.toString(),
                name: assessment.name,
                description: assessment.description,
                order: assessment.order,
                status: assessment.status,
                createdAt: assessment.createdAt,
                updatedAt: assessment.updatedAt,
            })
        );

        return {
            _pagination: { total, totalPage },
            data: mapped,
        };
    }

    @Put('/update/:assessment')
    @AssessmentAdminUpdateDoc()
    @Response('assessment.update')
    // @Permission('assessment', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async update(
        @Param('assessment', RequestRequiredPipe)
        assessment: string,
        @Body() updateDto: AssessmentUpdateDto,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const assessmentData: AssessmentDoc = await this.assessmentService.findOneById(assessment);
            if (!assessmentData) {
                throw new NotFoundException({
                    statusCode: ENUM_ASSESSMENT_STATUS_CODE_ERROR.ASSESSMENT_NOT_FOUND_ERROR,
                    message: 'assessment.error.notFound',
                });
            }
            const updated = await this.assessmentService.update(assessmentData, updateDto);
            return { data: updated };
        }

        const assessmentData: AssessmentDoc =
            await this.assessmentService.findOneById(assessment);
        if (!assessmentData) {
            throw new NotFoundException({
                statusCode:
                    ENUM_ASSESSMENT_STATUS_CODE_ERROR.ASSESSMENT_NOT_FOUND_ERROR,
                message: 'assessment.error.notFound',
            });
        }
        // Use default service for master database
        const updated = await this.assessmentService.update(
            assessmentData,
            updateDto
        );
        return { data: updated };
    }

    @Delete('/delete/:assessment')
    @AssessmentAdminDeleteDoc()
    @Response('assessment.delete')
    // @Permission('assessment', 'can_delete')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async delete(
        @Param('assessment', RequestRequiredPipe)
        assessment: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<void> {
        if (tenantId) {
            // Tenant connection removed - using central database only            // Check if assessment has related sections
            const sectionsCount = await this.sectionService.getTotal({
                assessment_id: assessment,
            });

            if (sectionsCount > 0) {
                // Soft delete if has related data
                await this.assessmentService.softDeleteById(assessment);
            } else {
                // Hard delete if no related data
                await this.assessmentService.deleteById(assessment);
            }
            return;
        }

        // Use default service for master database
        // Check if assessment has related sections
        const sectionsCount = await this.sectionService.getTotal({
            assessment_id: assessment,
        });

        if (sectionsCount > 0) {
            // Soft delete if has related data
            await this.assessmentService.softDeleteById(assessment);
        } else {
            // Hard delete if no related data
            await this.assessmentService.deleteById(assessment);
        }
    }

    @Put('/update-assessmet-order')
    @AssessmentAdminUpdateSectionsOrderDoc()
    @Response('assessment.updateAssessmentOrder')
    // @Permission('assessment', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async updateAssessmentOrder(
        @Body() updateDto: AssessmentOrderUpdateDto,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        const AssessmentIds = updateDto.sections.map(item => item._id);

        if (tenantId) {
            // Tenant connection removed - using central database only
            const Assessments = await this.assessmentService.findAll(
                {
                    _id: {
                        $in: AssessmentIds.map(id => id),
                    },
                },
                {
                    order: {
                        order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC,
                    },
                }
            );

            if (Assessments.length !== AssessmentIds.length) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'section.error.notFound',
                });
            }

            const operations = updateDto.sections.map(item => ({
                updateOne: {
                    filter: { _id: item._id },
                    update: { $set: { order: item.order } },
                },
            }));

            await this.assessmentService.bulkWrite(operations);

            return { data: { success: true } };
        }
        const Assessments = await this.assessmentService.findAll(
            {
                _id: { $in: AssessmentIds.map(id => id) },
            },
            {
                order: { order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC },
            }
        );

        if (Assessments.length !== AssessmentIds.length) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'section.error.notFound',
            });
        }

        const operations = updateDto.sections.map(item => ({
            updateOne: {
                filter: { _id: item._id },
                update: { $set: { order: item.order } },
            },
        }));

        await this.assessmentService.bulkWrite(operations);

        return { data: { success: true } };
    }

    @Put('/update-sections-order/:assessment')
    @AssessmentAdminUpdateSectionsOrderDoc()
    @Response('assessment.updateSectionsOrder')
    // @Permission('assessment', 'can_update')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async updateSectionsOrder(
        @Param('assessment', RequestRequiredPipe)
        assessment: string,
        @Body() updateDto: SectionOrderUpdateDto,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<any>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const sectionIds = updateDto.sections.map(item => item.sectionId);
            const sections = await this.sectionService.findAll({
                _id: { $in: sectionIds.map(id => id) },
                assessment_id: assessment,
            });

            if (sections.length !== sectionIds.length) {
                throw new NotFoundException({
                    statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                    message: 'section.error.notFound',
                });
            }

            const operations = updateDto.sections.map(item => ({
                updateOne: {
                    filter: { _id: item.sectionId },
                    update: { $set: { order: item.order } },
                },
            }));

            await this.sectionService.bulkWrite(operations);
            return { data: { success: true } };
        }
        const sectionIds = updateDto.sections.map(item => item.sectionId);
        const sections = await this.sectionService.findAll({
            _id: { $in: sectionIds.map(id => id) },
            assessment_id: assessment,
        });

        if (sections.length !== sectionIds.length) {
            throw new NotFoundException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'section.error.notFound',
            });
        }

        const operations = updateDto.sections.map(item => ({
            updateOne: {
                filter: { _id: item.sectionId },
                update: { $set: { order: item.order } },
            },
        }));

        await this.sectionService.bulkWrite(operations);

        return { data: { success: true } };
    }

    @Get('/sections-order/:assessment')
    @AssessmentAdminGetSectionsOrderDoc()
    @Response('assessment.getSectionsOrder')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async getSectionsOrder(
        @Param('assessment', RequestRequiredPipe)
        assessment: string,
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<SectionOrderListResponseDto[]>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const sections = await this.sectionService.findAll(
                { assessment_id: assessment },
                {
                    order: {
                        order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC,
                    },
                }
            );

            const orderData = sections.map(section => ({
                sectionId: section._id.toString(),
                order: section.order,
            }));

            return { data: orderData };
        }
        const sections = await this.sectionService.findAll(
            { assessment_id: assessment },
            { order: { order: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        );

        const orderData = sections.map(section => ({
            sectionId: section._id.toString(),
            order: section.order,
        }));

        return { data: orderData };
    }

    @Get('/dropdown')
    @AssessmentDropdownDoc()
    @Response('assessment.dropdown')
    // @Permission('assessment', 'can_read')
    @UseGuards(PermissionGuard)
    @AuthJwtAccessProtected()
    async getAssessmentDropdown(
        @AuthJwtPayload('tenantId') tenantId: string | null
    ): Promise<IResponse<AssessmentDropdownDto[]>> {
        if (tenantId) {
            // Tenant connection removed - using central database only
            const assessments = await this.assessmentService.findAll(
                { status: 1 },
                {
                    order: {
                        name: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC,
                    },
                }
            );

            const dropdownData = assessments.map(assessment => ({
                _id: assessment._id.toString(),
                name: assessment.name,
            }));

            return { data: dropdownData };
        }
        const assessments = await this.assessmentService.findAll(
            { status: 1 },
            { order: { name: ENUM_PAGINATION_ORDER_DIRECTION_TYPE.ASC } }
        );

        const dropdownData = assessments.map(assessment => ({
            _id: assessment._id.toString(),
            name: assessment.name,
        }));

        return { data: dropdownData };
    }
}
