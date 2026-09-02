import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Put,
    Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected } from '@modules/auth/decorators/auth.jwt.decorator';
import {
    PaginationQuery,
} from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import { PaginationService } from '@common/pagination/services/pagination.service';
import { RequestRequiredPipe } from '@common/request/pipes/request.required.pipe';
import {
    Response,
    ResponsePaging,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';

import { PlanService } from '@modules/plan/services/plan.service';
import { PlanCreateRequestDto } from '@modules/plan/dtos/request/plan.create.request.dto';
import { PlanUpdateRequestDto } from '@modules/plan/dtos/request/plan.update.request.dto';
import { PlanUpdateStatusRequestDto } from '@modules/plan/dtos/request/plan.update-status.request.dto';
import { PlanUpdateDisplayOrderRequestDto } from '@modules/plan/dtos/request/plan.update-display-order.request.dto';
import { PlanListResponseDto } from '@modules/plan/dtos/response/plan.list.response.dto';
import { PlanGetResponseDto } from '@modules/plan/dtos/response/plan.get.response.dto';
import { PlanDoc } from '@modules/plan/repository/entities/plan.entity';
import { ENUM_PLAN_STATUS } from '@modules/plan/enums/plan.enum';
import {
    PLAN_DEFAULT_AVAILABLE_ORDER_BY,
    PLAN_DEFAULT_AVAILABLE_SEARCH,
} from '@modules/plan/constants/plan.list.constant';
import {
    PlanAdminListDoc,
    PlanAdminGetDoc,
    PlanAdminCreateDoc,
    PlanAdminUpdateDoc,
    PlanAdminUpdateStatusDoc,
    PlanAdminSetDefaultDoc,
    PlanAdminUpdateDisplayOrderDoc,
    PlanAdminDeleteDoc,
    PlanAdminAnalyticsDoc,
} from '@modules/plan/docs/plan.admin.doc';
import {
    PlanAlreadyExistsException,
    PlanInactiveException,
} from '@modules/plan/exceptions/plan.exception';

import { PlanParsePipe } from '../pipes';

@ApiTags('modules.admin.plan')
@Controller({
    version: '1',
    path: '/plan',
})
export class PlanAdminController {
    constructor(
        private readonly paginationService: PaginationService,
        private readonly planService: PlanService
    ) { }

    @PlanAdminListDoc()
    @ResponsePaging('plan.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @PaginationQuery({
            availableSearch: PLAN_DEFAULT_AVAILABLE_SEARCH,
            availableOrderBy: PLAN_DEFAULT_AVAILABLE_ORDER_BY,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string
    ): Promise<IResponsePaging<PlanListResponseDto>> {
        let statusValue: number = 1;
        if (status === 'ACTIVE') {
            statusValue = ENUM_PLAN_STATUS.ACTIVE;
        } else if (status === 'INACTIVE') {
            statusValue = ENUM_PLAN_STATUS.INACTIVE;
        } else {
            status = null
        }
        const find: Record<string, any> = {
            ..._search,
            ...(status !== null && status !== '' && status !== undefined ? { status: { $eq: statusValue } } : {}),
        };

        const plans: PlanDoc[] = await this.planService.findAllWithPopulatedTools(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        const total: number = await this.planService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        const mapped: PlanListResponseDto[] = this.planService.mapList(plans);

        return {
            _pagination: { total, totalPage },
            data: mapped,
        };
    }

    @PlanAdminGetDoc()
    @Response('plan.get')
    @AuthJwtAccessProtected()
    @Get('/:plan')
    async get(
        @Param('plan', RequestRequiredPipe, PlanParsePipe) plan: PlanDoc
    ): Promise<IResponse<PlanGetResponseDto>> {
        // Populate tools data for the plan
        const planWithTools = await this.planService.findOneWithPopulatedTools(
            { _id: plan._id },
            {}
        );
        
        const mapped: PlanGetResponseDto = this.planService.mapGet(planWithTools);
        return { data: mapped };
    }

    @PlanAdminCreateDoc()
    @Response('plan.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body() body: PlanCreateRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const exist: boolean = await this.planService.existByName(body.name);
        if (exist) {
            throw new PlanAlreadyExistsException(body.name);
        }

        const created: PlanDoc = await this.planService.create(body);

        return {
            data: { _id: created._id.toString() },
        };
    }

    @PlanAdminUpdateDoc()
    @Response('plan.update')
    @AuthJwtAccessProtected()
    @Put('/:plan')
    async update(
        @Param('plan', RequestRequiredPipe, PlanParsePipe) plan: PlanDoc,
        @Body() body: PlanUpdateRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        if (body.name && body.name !== plan.name) {
            const exist = await this.planService.findOne({ name: body.name, _id: { $ne: plan._id } });
            if (exist) {
                throw new PlanAlreadyExistsException(body.name);
            }
        }
        console.log('body duration:', body.tools);

        const updated: PlanDoc = await this.planService.update(plan, body);

        return {
            data: { _id: updated._id.toString() },
        };
    }

    @PlanAdminUpdateStatusDoc()
    @Response('plan.updateStatus')
    @AuthJwtAccessProtected()
    @Patch('/:plan/status')
    async updateStatus(
        @Param('plan', RequestRequiredPipe, PlanParsePipe) plan: PlanDoc,
        @Body() body: PlanUpdateStatusRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const updated: PlanDoc = await this.planService.updateStatus(
            plan,
            body.status
        );

        return {
            data: { _id: updated._id.toString() },
        };
    }

    @PlanAdminSetDefaultDoc()
    @Response('plan.setDefault')
    @AuthJwtAccessProtected()
    @Patch('/:plan/set-default')
    async setDefault(
        @Param('plan', RequestRequiredPipe, PlanParsePipe) plan: PlanDoc
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        if (plan.status !== ENUM_PLAN_STATUS.ACTIVE) {
            throw new PlanInactiveException(plan._id.toString());
        }

        const updated: PlanDoc = await this.planService.setAsDefault(
            plan._id.toString()
        );

        return {
            data: { _id: updated._id.toString() },
        };
    }

    @PlanAdminUpdateDisplayOrderDoc()
    @Response('plan.updateDisplayOrder')
    @AuthJwtAccessProtected()
    @Put('/display-order')
    @HttpCode(HttpStatus.NO_CONTENT)
    async updateDisplayOrder(
        @Body() body: PlanUpdateDisplayOrderRequestDto
    ): Promise<void> {
        await this.planService.updateDisplayOrder(body.plans);
    }

    @PlanAdminDeleteDoc()
    @Response('plan.delete')
    @AuthJwtAccessProtected()
    @Delete('/:plan')
    async delete(
        @Param('plan', RequestRequiredPipe, PlanParsePipe) plan: PlanDoc
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        await this.planService.softDelete(plan);

        return {
            data: { _id: plan._id.toString() },
        };
    }

    @PlanAdminAnalyticsDoc()
    @ResponsePaging('plan.analytics')
    @AuthJwtAccessProtected()
    @Get('/analytics/overview')
    async analyticsOverview(): Promise<IResponse<Record<string, any>>> {
        const totalPlans = await this.planService.getTotal();
        const activePlans = await this.planService.countByStatus(
            ENUM_PLAN_STATUS.ACTIVE
        );
        const inactivePlans = await this.planService.countByStatus(
            ENUM_PLAN_STATUS.INACTIVE
        );

        const defaultPlan = await this.planService.findDefault();

        return {
            data: {
                total: totalPlans,
                active: activePlans,
                inactive: inactivePlans,
                defaultPlan: defaultPlan ? this.planService.mapGet(defaultPlan) : null,
            },
        };
    }
}