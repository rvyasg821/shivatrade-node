import {
    Controller,
    Get,
    Param,
    Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { UserProtected } from '@modules/user/decorators/user.decorator';
import { PlanService } from '@modules/plan/services/plan.service';
import { PlanListResponseDto } from '@modules/plan/dtos/response/plan.list.response.dto';
import { PlanGetResponseDto } from '@modules/plan/dtos/response/plan.get.response.dto';
import { PlanShortResponseDto } from '@modules/plan/dtos/response/plan.short.response.dto';
import { PlanParsePipe } from '@modules/plan/pipes/plan.parse.pipe';
import { PlanDoc } from '@modules/plan/repository/entities/plan.entity';
import { ENUM_PLAN_STATUS } from '@modules/plan/enums/plan.enum';
import {
    PLAN_DEFAULT_AVAILABLE_ORDER_BY,
    PLAN_DEFAULT_AVAILABLE_SEARCH,
} from '@modules/plan/constants/plan.list.constant';

@ApiTags('modules.shared.plan')
@Controller({
    version: '1',
    path: '/plan',
})
export class PlanSharedController {
    constructor(
        private readonly paginationService: PaginationService,
        private readonly planService: PlanService
    ) { }

    @ResponsePaging('plan.list')
    @AuthJwtAccessProtected()
    @UserProtected()
    @Get('/list')
    async list(
        @PaginationQuery({
            availableSearch: PLAN_DEFAULT_AVAILABLE_SEARCH,
            availableOrderBy: PLAN_DEFAULT_AVAILABLE_ORDER_BY,
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @AuthJwtPayload('roleName') roleName: string
    ): Promise<IResponsePaging<PlanListResponseDto>> {
        const find: Record<string, any> = {
            ..._search,
            status: ENUM_PLAN_STATUS.ACTIVE,
        };

        // Company Admin should not see Trial or LifeTime plans
        if (roleName === 'Company Admin') {
            find.trial = { $ne: true };
            find.is_lifetime = { $ne: true };
        }

        const plans: PlanDoc[] = await this.planService.findAllActive(find, {
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

    @Response('plan.get')
    @AuthJwtAccessProtected()
    @UserProtected()
    @Get('/:plan')
    async get(
        @Param('plan', RequestRequiredPipe, PlanParsePipe) plan: PlanDoc
    ): Promise<IResponse<PlanGetResponseDto>> {
        const mapped: PlanGetResponseDto = this.planService.mapGet(plan);
        return { data: mapped };
    }

    @ResponsePaging('plan.active')
    @AuthJwtAccessProtected()
    @UserProtected()
    @Get('/active/list')
    async activeList(
        @AuthJwtPayload('roleName') roleName: string
    ): Promise<IResponsePaging<PlanListResponseDto>> {
        let plans: PlanDoc[] = await this.planService.findActiveByDisplayOrder();

        // Company Admin should not see Trial or LifeTime plans
        if (roleName === 'Company Admin') {
            plans = plans.filter(plan => !plan.trial && !plan.is_lifetime);
        }

        const total: number = plans.length;

        const mapped: PlanListResponseDto[] = this.planService.mapList(plans);

        return {
            _pagination: { total, totalPage: 1 },
            data: mapped,
        };
    }

    @ResponsePaging('plan.short')
    @AuthJwtAccessProtected()
    @UserProtected()
    @Get('/short/list')
    async shortList(
        @AuthJwtPayload('roleName') roleName: string
    ): Promise<IResponsePaging<PlanShortResponseDto>> {
        let plans: PlanDoc[] = await this.planService.findActiveByDisplayOrder();

        // Company Admin should not see Trial or LifeTime plans
        if (roleName === 'Company Admin') {
            plans = plans.filter(plan => !plan.trial && !plan.is_lifetime);
        }

        const total: number = plans.length;

        const mapped: PlanShortResponseDto[] = this.planService.mapShort(plans);

        return {
            _pagination: { total, totalPage: 1 },
            data: mapped,
        };
    }

    @Response('plan.default')
    @AuthJwtAccessProtected()
    @UserProtected()
    @Get('/default/get')
    async getDefault(): Promise<IResponse<PlanGetResponseDto>> {
        const plan: PlanDoc = await this.planService.findDefault();
        const mapped: PlanGetResponseDto = this.planService.mapGet(plan);
        return { data: mapped };
    }

    @ResponsePaging('plan.compare')
    @AuthJwtAccessProtected()
    @UserProtected()
    @Get('/compare')
    async compare(
        @Query('ids') ids: string
    ): Promise<IResponsePaging<PlanGetResponseDto>> {
        if (!ids) {
            return {
                _pagination: { total: 0, totalPage: 0 },
                data: [],
            };
        }

        const planIds = ids.split(',').filter(id => id.trim());
        const plans: PlanDoc[] = [];

        for (const id of planIds) {
            try {
                const plan = await this.planService.findOneById(id.trim());
                if (plan && plan.status === ENUM_PLAN_STATUS.ACTIVE) {
                    plans.push(plan);
                }
            } catch (error) {
                // Skip invalid IDs
                continue;
            }
        }

        const total = plans.length;
        const mapped: PlanGetResponseDto[] = plans.map(plan =>
            this.planService.mapGet(plan)
        );

        return {
            _pagination: { total, totalPage: 1 },
            data: mapped,
        };
    }
}