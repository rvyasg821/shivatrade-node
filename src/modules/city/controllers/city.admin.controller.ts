import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    Res,
    UploadedFile,
} from '@nestjs/common';
import { ApiTags, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';
import { FileUploadSingle } from '@common/file/decorators/file.decorator';
import { IFile } from '@common/file/interfaces/file.interface';
import {
    datedFilename,
    handleImportRequest,
    sendExcel,
} from '@common/import/master-import.helper';

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

import { CityService } from '../services/city.service';
import { CityImportExportService } from '../services/city.import-export.service';
import { CityCreateRequestDto } from '../dtos/request/city.create.request.dto';
import { CityUpdateRequestDto } from '../dtos/request/city.update.request.dto';
import {
    CityDropdownDto,
    CityResponseDto,
} from '../dtos/response/city.response.dto';
import { ENUM_CITY_STATUS } from '../enums/city.enum';

@ApiTags('admin.city')
@Controller({
    version: '1',
    path: '/admin/city',
})
export class CityAdminController {
    constructor(
        private readonly cityService: CityService,
        private readonly importExportService: CityImportExportService
    ) {}

    // ============ IMPORT / EXPORT ============
    // Declared before the parameterised routes so `/export` is never swallowed
    // by `/get/:city`.

    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/sample-excel')
    @ApiOperation({ summary: 'Download sample Excel for city import' })
    async downloadSampleExcel(@Res() res: ExpressResponse) {
        sendExcel(
            res,
            this.importExportService.generateSampleExcel(),
            'cities-import-sample.xlsx'
        );
    }

    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({ summary: 'Export cities as Excel' })
    async exportExcel(@Res() res: ExpressResponse) {
        sendExcel(
            res,
            await this.importExportService.exportCities(),
            datedFilename('cities')
        );
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/import')
    @ApiOperation({
        summary: 'Import cities from Excel/CSV (preview or confirm)',
    })
    async importExcel(
        @UploadedFile() file: IFile,
        @Query('preview') preview?: string
    ) {
        return handleImportRequest(
            file,
            preview,
            () => this.importExportService.parseAndValidate(file.buffer),
            (rows) => this.importExportService.importCities(rows)
        );
    }

    @Response('city.create')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body() body: CityCreateRequestDto
    ): Promise<IResponse<CityResponseDto>> {
        const row = await this.cityService.create(body);
        return { data: await this.cityService.mapGetWithParents(row) };
    }

    @ResponsePaging('city.list')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @PaginationQuery() { _limit, _offset }: PaginationListDto,
        @Query('search') search?: string,
        @Query('state_id') stateId?: string,
        @Query('country_id') countryId?: string,
        @Query('status') status?: string
    ): Promise<IResponsePaging<CityResponseDto>> {
        const [data, total] = await this.cityService.findForList({
            q: search?.trim() || undefined,
            state_id: stateId || undefined,
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

    @Response('city.dropdown')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @Query('state_id') stateId?: string,
        @Query('country_id') countryId?: string,
        @Query('q') q?: string
    ): Promise<IResponse<CityDropdownDto[]>> {
        const data = await this.cityService.findForDropdown({
            state_id: stateId || undefined,
            country_id: countryId || undefined,
            q: q || undefined,
        });
        return { data };
    }

    @Response('city.get')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/get/:cityId')
    async get(
        @Param('cityId') cityId: string
    ): Promise<IResponse<CityResponseDto>> {
        const row = await this.cityService.findOneById(cityId);
        return { data: await this.cityService.mapGetWithParents(row) };
    }

    @Response('city.update')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/update/:cityId')
    async update(
        @Param('cityId') cityId: string,
        @Body() body: CityUpdateRequestDto
    ): Promise<IResponse<CityResponseDto>> {
        const row = await this.cityService.findOneById(cityId);
        const updated = await this.cityService.update(row, body);
        return { data: await this.cityService.mapGetWithParents(updated) };
    }

    /** A city is the leaf of the geo tree — nothing hangs off it, so no guard. */
    @Response('city.delete')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Delete('/delete/:cityId')
    async delete(@Param('cityId') cityId: string): Promise<void> {
        const row = await this.cityService.findOneById(cityId);
        await this.cityService.softDelete(row);
    }

    private parseStatus(status?: string): ENUM_CITY_STATUS | undefined {
        if (!status) return undefined;
        const value = status.toUpperCase();
        return (STATUS_VALUES as string[]).includes(value)
            ? (value as ENUM_CITY_STATUS)
            : undefined;
    }
}

const STATUS_VALUES = Object.values(ENUM_CITY_STATUS);
