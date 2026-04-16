import {
    BadRequestException,
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    HttpStatus,
    UseGuards,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { PaginationService } from '@common/pagination/services/pagination.service';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
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
import { AuthJwtAccessProtected } from '@modules/auth/decorators/auth.jwt.decorator';
import { DiscountService } from '../services/discount.service';
import { DiscountCreateRequestDto } from '../dtos/request/discount.create.request.dto';
import { DiscountUpdateRequestDto } from '../dtos/request/discount.update.request.dto';
import { DiscountListResponseDto } from '../dtos/response/discount.list.response.dto';
import { DiscountGetResponseDto } from '../dtos/response/discount.get.response.dto';
import { DiscountDoc } from '../repository/entities/discount.entity';
import { GetDiscount } from '../decorators/discount.decorator';
import { PermissionGuard } from '@modules/role/guards/permission.guard';
import { Permission } from '@modules/role/decorators/permission.decorator';
import { UserProtected } from '@modules/user/decorators/user.decorator';
import { DiscountParsePipe } from '../pipes/discount.parse.pipe';
import {
    DiscountAdminCreateDoc,
    DiscountAdminDeleteDoc,
    DiscountAdminGetDoc,
    DiscountAdminListDoc,
    DiscountAdminUpdateDoc,
} from '../docs/discount.admin.doc';

@ApiTags('modules.admin.discount')
@Controller({
    version: '1',
    path: '/discount',
})
export class DiscountAdminController {
    constructor(
        private readonly paginationService: PaginationService,
        private readonly discountService: DiscountService
    ) {}
    @DiscountAdminListDoc()
    @ResponsePaging('discount.list')
    @ApiBearerAuth('accessToken')
    @Permission('discount', 'can_read')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @PaginationQuery({
            availableSearch: ['name', 'discount_code'],
            availableOrderBy: [
                'name',
                'discount_value',
                'discount_code',
                'createdAt',
                'updatedAt',
                'status',
                'max_occurances',
                'start_date',
                'end_date',
            ],
        })
        { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status: string
    ): Promise<IResponsePaging<DiscountListResponseDto>> {
        const find: Record<string, any> = {
            ..._search,
            deletedAt: null,
        };

        if (status && status === 'ACTIVE') {
            find.status = { $eq: 1 };
        }
        if (status && status === 'INACTIVE') {
            find.status = { $eq: 0 };
        }

        const discounts: DiscountDoc[] = await this.discountService.findAll(
            find,
            {
                paging: {
                    limit: _limit,
                    offset: _offset,
                },
                order: _order,
            }
        );

        const total: number = await this.discountService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );

        const mapped: DiscountListResponseDto[] =
            this.discountService.mapList(discounts);

        return {
            _pagination: { total, totalPage },
            data: mapped,
        };
    }

    @DiscountAdminGetDoc()
    @Response('discount.get')
    @ApiBearerAuth('accessToken')
    @Permission('discount', 'can_read')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @ApiParam({ name: 'discount', type: 'string' })
    @Get('/:discount')
    async get(
        @Param('discount', RequestRequiredPipe, DiscountParsePipe)
        discount: DiscountDoc
    ): Promise<IResponse<DiscountGetResponseDto>> {
        const mapped: DiscountGetResponseDto =
            this.discountService.mapGet(discount);
        return { data: mapped };
    }

    @DiscountAdminCreateDoc()
    @Response('discount.create')
    @ApiBearerAuth('accessToken')
    @Permission('discount', 'can_create')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body() body: DiscountCreateRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const created: DiscountDoc = await this.discountService.create(body);

        return {
            data: { _id: created._id.toString() },
        };
    }

    @DiscountAdminUpdateDoc()
    @Response('discount.update')
    @ApiBearerAuth('accessToken')
    @Permission('discount', 'can_update')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @ApiParam({ name: 'discount', type: 'string' })
    @Put('/:discount/update')
    async update(
        @Param('discount', RequestRequiredPipe, DiscountParsePipe)
        discount: DiscountDoc,
        @Body() body: DiscountUpdateRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const updated: DiscountDoc = await this.discountService.update(
            discount,
            body
        );

        return {
            data: { _id: updated._id.toString() },
        };
    }

    @DiscountAdminDeleteDoc()
    @Response('discount.delete')
    @ApiBearerAuth('accessToken')
    @Permission('discount', 'can_delete')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @ApiParam({ name: 'discount', type: 'string' })
    @Delete('/:discount/delete')
    async delete(
        @Param('discount', RequestRequiredPipe, DiscountParsePipe)
        discount: DiscountDoc
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        await this.discountService.delete(discount);

        return {
            data: { _id: discount._id.toString() },
        };
    }

    @Response('discount.delete')
    @ApiBearerAuth('accessToken')
    @Permission('discount', 'can_delete')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/delete-many')
    async deleteMany(
        @Body() body: { ids: string[] }
    ): Promise<IResponse<any>> {
        const { ids } = body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw new BadRequestException('ids array is required');
        }

        const deletedCount = await this.discountService.hardDeleteMany(ids);

        return {
            data: { deletedCount },
        };
    }

    @Response('discount.analytics')
    @ApiBearerAuth('accessToken')
    @Permission('discount', 'can_read')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/analytics/overview')
    async analyticsOverview(): Promise<IResponse<Record<string, any>>> {
        const totalDiscounts = await this.discountService.getTotal({
            deletedAt: null,
        });
        const activeDiscounts = await this.discountService.countByStatus(1);
        const inactiveDiscounts = await this.discountService.countByStatus(0);
        const expiredDiscounts = await this.discountService.getTotal({
            is_expired: true,
            deletedAt: null,
        });

        return {
            data: {
                total: totalDiscounts,
                active: activeDiscounts,
                inactive: inactiveDiscounts,
                expired: expiredDiscounts,
            },
        };
    }

    @Response('discount.markExpired')
    @ApiBearerAuth('accessToken')
    @Permission('discount', 'can_update')
    @UseGuards(PermissionGuard)
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/mark-expired')
    async markExpired(): Promise<IResponse<Record<string, any>>> {
        const count = await this.discountService.markExpiredDiscounts();

        return {
            data: { count },
        };
    }
}
