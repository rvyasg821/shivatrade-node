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
import {
    AuthJwtAccessProtected,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { Response, ResponsePaging } from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';

import { PortMasterService } from '../services/port-master.service';
import { PortMasterRepository } from '../repository/repositories/port-master.repository';
import { PortMasterCreateRequestDto } from '../dtos/request/port-master.create.request.dto';
import { PortMasterUpdateRequestDto } from '../dtos/request/port-master.update.request.dto';
import {
    PortMasterResponseDto,
    PortMasterDropdownDto,
} from '../dtos/response/port-master.response.dto';
import { ENUM_PORT_TYPE } from '../enums/port-master.enum';

@ApiTags('admin.port-master')
@Controller({
    version: '1',
    path: '/admin/port-master',
})
export class PortMasterAdminController {
    constructor(
        private readonly portMasterService: PortMasterService,
        private readonly portMasterRepository: PortMasterRepository
    ) {}

    @Response('port-master.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body() body: PortMasterCreateRequestDto
    ): Promise<IResponse<PortMasterResponseDto>> {
        const row = await this.portMasterService.create(body);
        return { data: this.portMasterService.mapGet(row) };
    }

    @ResponsePaging('port-master.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('country_code') countryCode?: string,
        @Query('type') type?: string,
        @Query('is_active') isActive?: string
    ): Promise<IResponsePaging<PortMasterResponseDto>> {
        const find: any = { soft_delete: false };

        if (countryCode) find.country_code = countryCode.toUpperCase();
        if (type) find.type = type;
        if (isActive === 'true') find.is_active = true;
        else if (isActive === 'false') find.is_active = false;

        if (_search) {
            find.$or = [
                { code: { $regex: _search, $options: 'i' } },
                { name: { $regex: _search, $options: 'i' } },
            ];
        }

        const rows = await this.portMasterRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });
        const total = await this.portMasterRepository.getTotal(find);

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: this.portMasterService.mapList(rows),
        };
    }

    @Response('port-master.dropdown')
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @Query('country_code') countryCode?: string,
        @Query('types') types?: string,
        @Query('q') q?: string
    ): Promise<IResponse<PortMasterDropdownDto[]>> {
        const typeArr = (types || '')
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
            .filter((t): t is ENUM_PORT_TYPE =>
                Object.values(ENUM_PORT_TYPE).includes(t as ENUM_PORT_TYPE)
            );

        const data = await this.portMasterService.findForDropdown({
            country_code: countryCode ? countryCode.toUpperCase() : undefined,
            types: typeArr.length ? typeArr : undefined,
            q,
        });
        return { data };
    }

    @Response('port-master.get')
    @AuthJwtAccessProtected()
    @Get('/get/:portId')
    async get(
        @Param('portId') portId: string
    ): Promise<IResponse<PortMasterResponseDto>> {
        const row = await this.portMasterService.findOneById(portId);
        return { data: this.portMasterService.mapGet(row) };
    }

    @Response('port-master.update')
    @AuthJwtAccessProtected()
    @Put('/update/:portId')
    async update(
        @Param('portId') portId: string,
        @Body() body: PortMasterUpdateRequestDto
    ): Promise<IResponse<PortMasterResponseDto>> {
        const row = await this.portMasterService.findOneById(portId);
        const updated = await this.portMasterService.update(row, body);
        return { data: this.portMasterService.mapGet(updated) };
    }

    @Response('port-master.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:portId')
    async delete(@Param('portId') portId: string): Promise<void> {
        const row = await this.portMasterService.findOneById(portId);
        await this.portMasterService.softDelete(row);
    }
}
