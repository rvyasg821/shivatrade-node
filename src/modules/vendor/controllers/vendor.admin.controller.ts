import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { Response, ResponsePaging } from '@common/response/decorators/response.decorator';
import { IResponse, IResponsePaging } from '@common/response/interfaces/response.interface';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';

import { VendorService } from '../services/vendor.service';
import { VendorRepository } from '../repository/repositories/vendor.repository';
import { VendorCategoryRepository } from '../repository/repositories/vendor-category.repository';
import { VendorCreateRequestDto } from '../dtos/request/vendor.create.request.dto';
import { VendorUpdateRequestDto } from '../dtos/request/vendor.update.request.dto';
import { VendorGetResponseDto } from '../dtos/response/vendor.get.response.dto';
import { VendorListResponseDto } from '../dtos/response/vendor.list.response.dto';

@ApiTags('admin.vendor')
@Controller({ version: '1', path: '/admin/vendor' })
export class VendorAdminController {
    constructor(
        private readonly vendorService: VendorService,
        private readonly vendorRepository: VendorRepository,
        private readonly vendorCategoryRepository: VendorCategoryRepository
    ) {}

    @Response('vendor.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: VendorCreateRequestDto
    ): Promise<IResponse<VendorGetResponseDto>> {
        const vendor = await this.vendorService.create(companyId, body, userId);
        const data = await this.vendorService.mapGetWithRelations(vendor);
        return { data };
    }

    @ResponsePaging('vendor.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('category_id') categoryId?: string
    ): Promise<IResponsePaging<VendorListResponseDto>> {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;

        if (status === 'ACTIVE') find.is_active = true;
        else if (status === 'INACTIVE') find.is_active = false;

        if (categoryId) {
            const vendorIds = await this.vendorService.findVendorIdsByCategoryId(
                companyId,
                categoryId
            );
            if (vendorIds.length === 0) {
                return {
                    _pagination: { total: 0, totalPage: 0 },
                    data: [],
                };
            }
            find._id = { $in: vendorIds };
        }

        if (_search) {
            find.$or = [
                { company_name: { $regex: _search, $options: 'i' } },
                { website: { $regex: _search, $options: 'i' } },
                { city: { $regex: _search, $options: 'i' } },
            ];
        }

        const vendors = await this.vendorRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });

        const total = await this.vendorRepository.getTotal(find);
        const data = await this.vendorService.mapListWithRelations(vendors);

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('vendor.dropdown')
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<
        IResponse<
            {
                _id: string;
                company_name: string;
                vendor_code?: string;
                category_ids: string[];
            }[]
        >
    > {
        const find: any = { soft_delete: false, is_active: true };
        if (companyId) find.company_id = companyId;
        const vendors = await this.vendorRepository.findAll(find, {
            order: { company_name: 'asc' as any },
        });

        // Fetch all vendor↔category links for this company in one query and
        // group by vendor_id so each vendor in the response gets its
        // categories without N+1 round-trips.
        const links = await this.vendorCategoryRepository.findAll(
            { company_id: companyId } as any
        );
        const byVendor = new Map<string, string[]>();
        for (const l of links as any[]) {
            const vid = l.vendor_id?.toString();
            const cid = l.category_id?.toString();
            if (!vid || !cid) continue;
            if (!byVendor.has(vid)) byVendor.set(vid, []);
            byVendor.get(vid)!.push(cid);
        }

        return {
            data: vendors.map((v) => ({
                _id: v._id.toString(),
                company_name: v.company_name,
                vendor_code: v.vendor_code,
                category_ids: byVendor.get(v._id.toString()) || [],
            })),
        };
    }

    @Response('vendor.get')
    @AuthJwtAccessProtected()
    @Get('/get/:vendorId')
    async get(
        @Param('vendorId') vendorId: string
    ): Promise<IResponse<VendorGetResponseDto>> {
        const vendor = await this.vendorService.findOneById(vendorId);
        const data = await this.vendorService.mapGetWithRelations(vendor);
        return { data };
    }

    @Response('vendor.update')
    @AuthJwtAccessProtected()
    @Put('/update/:vendorId')
    async update(
        @Param('vendorId') vendorId: string,
        @Body() body: VendorUpdateRequestDto
    ): Promise<IResponse<VendorGetResponseDto>> {
        const vendor = await this.vendorService.findOneById(vendorId);
        const updated = await this.vendorService.update(vendor, body);
        const data = await this.vendorService.mapGetWithRelations(updated);
        return { data };
    }

    @Response('vendor.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:vendorId')
    async delete(
        @AuthJwtPayload('user') userId: string,
        @Param('vendorId') vendorId: string
    ): Promise<void> {
        const vendor = await this.vendorService.findOneById(vendorId);
        await this.vendorService.softDelete(vendor, userId);
    }
}
