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

import { CreatorScopeService } from '@modules/creator-scope/creator-scope.service';
import { CustomerService } from '../services/customer.service';
import { CustomerRepository } from '../repository/repositories/customer.repository';
import { CustomerCreateRequestDto } from '../dtos/request/customer.create.request.dto';
import { CustomerUpdateRequestDto } from '../dtos/request/customer.update.request.dto';
import { CustomerGetResponseDto } from '../dtos/response/customer.get.response.dto';
import { CustomerListResponseDto } from '../dtos/response/customer.list.response.dto';
import { CustomerStatsResponseDto } from '../dtos/response/customer.stats.response.dto';

@ApiTags('admin.customer')
@Controller({ version: '1', path: '/admin/customer' })
export class CustomerAdminController {
    constructor(
        private readonly customerService: CustomerService,
        private readonly customerRepository: CustomerRepository,
        private readonly creatorScope: CreatorScopeService
    ) {}

    @Response('customer.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: CustomerCreateRequestDto
    ): Promise<IResponse<CustomerGetResponseDto>> {
        const customer = await this.customerService.create(companyId, body, userId);
        const data = await this.customerService.mapGetWithRelations(customer);
        return { data };
    }

    @ResponsePaging('customer.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @AuthJwtPayload('locationId') locationId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('country') country?: string,
        @Query('created_by') createdBy?: string
    ): Promise<IResponsePaging<CustomerListResponseDto>> {
        const find: any = { soft_delete: false };
        if (companyId) find.company_id = companyId;

        if (status === 'ACTIVE') find.is_active = true;
        else if (status === 'INACTIVE') find.is_active = false;

        if (country) find.country = country;

        if (_search) {
            find.$or = [
                { company_name: { $regex: _search, $options: 'i' } },
                { website: { $regex: _search, $options: 'i' } },
                { city: { $regex: _search, $options: 'i' } },
                { country: { $regex: _search, $options: 'i' } },
            ];
        }

        // Ownership scope (Created-By filter) — enforced backend-side.
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );
        Object.assign(find, CreatorScopeService.toFind(creatorValue));

        const customers = await this.customerRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });

        const total = await this.customerRepository.getTotal(find);
        const data = await this.customerService.mapListWithRelations(customers);

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('customer.stats')
    @AuthJwtAccessProtected()
    @Get('/stats')
    async stats(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @AuthJwtPayload('locationId') locationId: string,
        @Query('search') search?: string,
        @Query('country') country?: string,
        @Query('created_by') createdBy?: string
    ): Promise<IResponse<CustomerStatsResponseDto>> {
        // Same ownership scope as /list so the tiles match the table.
        const creatorValue = await this.creatorScope.resolveCreatorValue(
            { user: userId, roleName, companyId, assignedLocations, locationId },
            createdBy
        );
        const data = await this.customerService.stats(
            companyId,
            { search, country },
            creatorValue
        );
        return { data };
    }

    @Response('customer.dropdown')
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<IResponse<{ _id: string; company_name: string }[]>> {
        const find: any = { soft_delete: false, is_active: true };
        if (companyId) find.company_id = companyId;
        const customers = await this.customerRepository.findAll(find, {
            order: { company_name: 'asc' as any },
        });
        return {
            data: customers.map((c) => ({
                _id: c._id.toString(),
                company_name: c.company_name,
            })),
        };
    }

    @Response('customer.get')
    @AuthJwtAccessProtected()
    @Get('/get/:customerId')
    async get(
        @Param('customerId') customerId: string
    ): Promise<IResponse<CustomerGetResponseDto>> {
        const customer = await this.customerService.findOneById(customerId);
        const data = await this.customerService.mapGetWithRelations(customer);
        return { data };
    }

    @Response('customer.update')
    @AuthJwtAccessProtected()
    @Put('/update/:customerId')
    async update(
        @Param('customerId') customerId: string,
        @Body() body: CustomerUpdateRequestDto
    ): Promise<IResponse<CustomerGetResponseDto>> {
        const customer = await this.customerService.findOneById(customerId);
        const updated = await this.customerService.update(customer, body);
        const data = await this.customerService.mapGetWithRelations(updated);
        return { data };
    }

    @Response('customer.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:customerId')
    async delete(
        @AuthJwtPayload('user') userId: string,
        @Param('customerId') customerId: string
    ): Promise<void> {
        const customer = await this.customerService.findOneById(customerId);
        await this.customerService.softDelete(customer, userId);
    }
}
