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
    Res,
    UploadedFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';
import { FileUploadSingle } from '@common/file/decorators/file.decorator';
import { IFile } from '@common/file/interfaces/file.interface';

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

import { UomService } from '../services/uom.service';
import { UomImportExportService } from '../services/uom.import-export.service';
import { UomCreateRequestDto } from '../dtos/request/uom.create.request.dto';
import { UomUpdateRequestDto } from '../dtos/request/uom.update.request.dto';
import { UomDropdownDto, UomResponseDto } from '../dtos/response/uom.response.dto';
import { ENUM_UOM_STATUS } from '../enums/uom.enum';

@ApiTags('admin.uom')
@Controller({
    version: '1',
    path: '/admin/uom',
})
export class UomAdminController {
    constructor(
        private readonly uomService: UomService,
        private readonly importExportService: UomImportExportService
    ) {}

    // ============ IMPORT / EXPORT ============
    // Declared BEFORE the parameterised routes below so '/export' is never
    // swallowed by a '/:id'-style match.

    @AuthJwtAccessProtected()
    @Get('/sample-excel')
    @ApiOperation({ summary: 'Download sample Excel for UOM import' })
    async downloadSampleExcel(@Res() res: ExpressResponse) {
        const buffer = this.importExportService.generateSampleExcel();
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="uom-import-sample.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({ summary: 'Export units of measure as Excel' })
    async exportExcel(@Res() res: ExpressResponse) {
        const buffer = await this.importExportService.exportUoms();
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="uom-${
                new Date().toISOString().split('T')[0]
            }.xlsx"`
        );
        res.end(buffer);
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import')
    @ApiOperation({
        summary: 'Import units of measure from Excel/CSV (preview or confirm)',
    })
    async importExcel(
        @UploadedFile() file: IFile,
        @Query('preview') preview?: string
    ) {
        if (!file) throw new BadRequestException('No file provided');

        const { summary, rows } =
            await this.importExportService.parseAndValidate(file.buffer);

        if (preview === 'true') {
            return {
                statusCode: 200,
                message: 'Preview',
                data: { summary, rows },
            };
        }

        const validRows = rows.filter((r) => r.status !== 'error');
        if (validRows.length === 0) {
            return {
                statusCode: 200,
                message: 'No valid rows to import',
                data: { summary, created: 0, updated: 0, errors: [] },
            };
        }

        const result = await this.importExportService.importUoms(validRows);
        return {
            statusCode: 200,
            message: `Imported ${result.created} new, updated ${result.updated}`,
            data: { summary, ...result },
        };
    }

    @Response('uom.create')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body() body: UomCreateRequestDto
    ): Promise<IResponse<UomResponseDto>> {
        const row = await this.uomService.create(body);
        return { data: this.uomService.mapGet(row) };
    }

    @ResponsePaging('uom.list')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @PaginationQuery() { _limit, _offset }: PaginationListDto,
        @Query('search') search?: string,
        @Query('status') status?: string
    ): Promise<IResponsePaging<UomResponseDto>> {
        const [data, total] = await this.uomService.findForList({
            q: search?.trim() || undefined,
            status: this.parseStatus(status),
            limit: _limit,
            offset: _offset,
        });

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    /**
     * Every active unit. Consumed by the product form AND by every line-item
     * grid (SO / POV / quotation / invoice), so it is on the hot path — keep it
     * unpaginated and cheap.
     */
    @Response('uom.dropdown')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(): Promise<IResponse<UomDropdownDto[]>> {
        return { data: await this.uomService.findForDropdown() };
    }

    @Response('uom.get')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/get/:uomId')
    async get(@Param('uomId') uomId: string): Promise<IResponse<UomResponseDto>> {
        const row = await this.uomService.findOneById(uomId);
        return { data: this.uomService.mapGet(row) };
    }

    @Response('uom.update')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/update/:uomId')
    async update(
        @Param('uomId') uomId: string,
        @Body() body: UomUpdateRequestDto
    ): Promise<IResponse<UomResponseDto>> {
        const row = await this.uomService.findOneById(uomId);
        const updated = await this.uomService.update(row, body);
        return { data: this.uomService.mapGet(updated) };
    }

    @Response('uom.delete')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Delete('/delete/:uomId')
    async delete(@Param('uomId') uomId: string): Promise<void> {
        const row = await this.uomService.findOneById(uomId);

        // Refuse to delete a unit that products still hold. The unit is loose
        // text with no foreign key, so deleting it would not error — it would
        // silently leave those products with a unit the dropdown cannot render,
        // and nobody would notice until an invoice printed a blank column.
        const inUse = await this.uomService.countInUse(row.code);
        if (inUse > 0) {
            throw new BadRequestException(
                `Cannot delete '${row.code}' — ${inUse} product(s) use it. ` +
                    `Change those products' unit first, or set this unit to Inactive to hide it from new documents.`
            );
        }

        await this.uomService.softDelete(row);
    }

    private parseStatus(status?: string): ENUM_UOM_STATUS | undefined {
        if (!status) return undefined;
        const value = status.toUpperCase();
        return (STATUS_VALUES as string[]).includes(value)
            ? (value as ENUM_UOM_STATUS)
            : undefined;
    }
}

const STATUS_VALUES = Object.values(ENUM_UOM_STATUS);
