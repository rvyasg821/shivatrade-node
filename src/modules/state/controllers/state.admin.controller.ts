import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthJwtAccessProtected } from '@modules/auth/decorators/auth.jwt.decorator';
import { UserProtected } from '@modules/user/decorators/user.decorator';
import {
    Response,
    ResponsePaging,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';

import { StateService } from '../services/state.service';
import { StateCreateRequestDto } from '../dtos/request/state.create.request.dto';
import { StateUpdateRequestDto } from '../dtos/request/state.update.request.dto';
import {
    StateDropdownDto,
    StateResponseDto,
} from '../dtos/response/state.response.dto';
import { ENUM_STATE_STATUS } from '../enums/state.enum';
import { CityRepository } from '@modules/city/repository/repositories/city.repository';

@ApiTags('admin.state')
@Controller({
    version: '1',
    path: '/admin/state',
})
export class StateAdminController {
    constructor(
        private readonly stateService: StateService,
        private readonly cityRepository: CityRepository
    ) {}

    @Response('state.create')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body() body: StateCreateRequestDto
    ): Promise<IResponse<StateResponseDto>> {
        const row = await this.stateService.create(body);
        return { data: await this.stateService.mapGetWithCountry(row) };
    }

    @ResponsePaging('state.list')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @PaginationQuery() { _limit, _offset }: PaginationListDto,
        @Query('search') search?: string,
        @Query('country_id') countryId?: string,
        @Query('status') status?: string
    ): Promise<IResponsePaging<StateResponseDto>> {
        // Read `search` off the raw query, not `_search`: PaginationSearchPipe
        // only populates `_search` when given an `availableSearch` list, and
        // this controller searches in SQL rather than through the mongo-ish
        // translator. Same approach as the currency master.
        const [data, total] = await this.stateService.findForList({
            q: search?.trim() || undefined,
            country_id: countryId || undefined,
            status: this.parseStatus(status),
            limit: _limit,
            offset: _offset,
        });

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('state.dropdown')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @Query('country_id') countryId?: string,
        @Query('country_code') countryCode?: string,
        @Query('q') q?: string
    ): Promise<IResponse<StateDropdownDto[]>> {
        const data = await this.stateService.findForDropdown({
            country_id: countryId || undefined,
            country_code: countryCode || undefined,
            q: q || undefined,
        });
        return { data };
    }

    @Response('state.get')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/get/:stateId')
    async get(
        @Param('stateId') stateId: string
    ): Promise<IResponse<StateResponseDto>> {
        const row = await this.stateService.findOneById(stateId);
        return { data: await this.stateService.mapGetWithCountry(row) };
    }

    @Response('state.update')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/update/:stateId')
    async update(
        @Param('stateId') stateId: string,
        @Body() body: StateUpdateRequestDto
    ): Promise<IResponse<StateResponseDto>> {
        const row = await this.stateService.findOneById(stateId);
        const updated = await this.stateService.update(row, body);
        return { data: await this.stateService.mapGetWithCountry(updated) };
    }

    @Response('state.delete')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Delete('/delete/:stateId')
    async delete(@Param('stateId') stateId: string): Promise<void> {
        const row = await this.stateService.findOneById(stateId);

        // Refuse to orphan cities. Deleting the parent would leave them
        // pointing at a state that no longer resolves, and the city list would
        // show a blank column with no way to tell what happened.
        const cities = await this.cityRepository.countByState(stateId);
        if (cities > 0) {
            throw new BadRequestException(
                `Cannot delete '${row.name}' — ${cities} city/cities belong to it. Delete or re-assign them first.`
            );
        }

        await this.stateService.softDelete(row);
    }

    private parseStatus(status?: string): ENUM_STATE_STATUS | undefined {
        if (!status) return undefined;
        const value = status.toUpperCase();
        return (STATUS_VALUES as string[]).includes(value)
            ? (value as ENUM_STATE_STATUS)
            : undefined;
    }
}

const STATUS_VALUES = Object.values(ENUM_STATE_STATUS);
