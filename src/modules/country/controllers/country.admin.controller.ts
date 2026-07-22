import {
    Get,
    Put,
    Body,
    Post,
    Param,
    Query,
    Delete,
    Controller,
    ConflictException,
    Patch,
    Res,
    UploadedFile,
    BadRequestException,
    InternalServerErrorException,
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
import { PaginationQuery, PaginationQueryFilterInEnum } from '@common/pagination/decorators/pagination.decorator';
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

import { AuthJwtAccessProtected } from '@modules/auth/decorators/auth.jwt.decorator';
import { COUNTRY_DEFAULT_AVAILABLE_SEARCH } from '@modules/country/constants/country.list.constant';
import { ENUM_COUNTRY_STATUS_CODE_ERROR } from '@modules/country/enums/country.status-code.enum';
import {
    CountryAdminListDoc,
    CountryAdminGetDoc,
    CountryAdminCreateDoc,
    CountryAdminUpdateDoc,
    CountryAdminDeleteDoc,
    CountryAdminUpdateStatusDoc,
} from '../docs/country.admin.doc';
import { CountryCreateRequestDto } from '@modules/country/dtos/request/country.create.request.dto';
import { CountryUpdateRequestDto } from '@modules/country/dtos/request/country.update.request.dto';
import { CountryUpdateStatusRequestDto } from '@modules/country/dtos/request/country.update-status.request.dto';
import { CountryGetResponseDto } from '@modules/country/dtos/response/country.get.response.dto';
import { CountryListResponseDto } from '@modules/country/dtos/response/country.list.response.dto';
import { CountryParsePipe } from '@modules/country/pipes/country.parse.pipe';
import { CountryDoc } from '@modules/country/repository/entities/country.entity';
import { CountryService } from '@modules/country/services/country.service';
import { CountryImportExportService } from '@modules/country/services/country.import-export.service';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import { UserProtected } from '@modules/user/decorators/user.decorator';
import { CountryIsUsedPipe } from '@modules/country/pipes/country.is-used.pipe';
import { ENUM_COUNTRY_STATUS } from '@modules/country/enums/country.enum';
import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import {COUNTRY_DEFAULT_STATUS} from '@modules/country/constants/country.list.constant';
import { CountryShortResponseDto } from '@modules/country/dtos/response/country.short.response.dto';
import { StateRepository } from '@modules/state/repository/repositories/state.repository';
import { CityRepository } from '@modules/city/repository/repositories/city.repository';

@ApiTags('modules.admin.country')
@Controller({
    version: '1',
    path: '/admin/country',
})
export class CountryAdminController {
    constructor(
        private readonly paginationService: PaginationService,
        private readonly countryService: CountryService,
        private readonly stateRepository: StateRepository,
        private readonly cityRepository: CityRepository,
        private readonly importExportService: CountryImportExportService
    ) {}

    // ============ IMPORT / EXPORT ============
    // Declared before the parameterised routes so `/export` is never swallowed
    // by `/get/:country`.

    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/sample-excel')
    @ApiOperation({ summary: 'Download sample Excel for country import' })
    async downloadSampleExcel(@Res() res: ExpressResponse) {
        sendExcel(
            res,
            this.importExportService.generateSampleExcel(),
            'countries-import-sample.xlsx'
        );
    }

    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({ summary: 'Export countries as Excel' })
    async exportExcel(@Res() res: ExpressResponse) {
        sendExcel(
            res,
            await this.importExportService.exportCountries(),
            datedFilename('countries')
        );
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/import')
    @ApiOperation({
        summary: 'Import countries from Excel/CSV (preview or confirm)',
    })
    async importExcel(
        @UploadedFile() file: IFile,
        @Query('preview') preview?: string
    ) {
        return handleImportRequest(
            file,
            preview,
            () => this.importExportService.parseAndValidate(file.buffer),
            (rows) => this.importExportService.importCountries(rows)
        );
    }

    /**
     * Active countries for the address dropdowns.
     *
     * Unpaginated by design — there are ~250 countries and every address form
     * needs the whole list at once to resolve a stored code back to a label.
     */
    @Response('country.dropdown')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @Query('q') q?: string
    ): Promise<IResponse<CountryShortResponseDto[]>> {
        const find: Record<string, any> = q?.trim()
            ? { name: { $regex: q.trim(), $options: 'i' } }
            : {};

        const countries: CountryDoc[] = await this.countryService.findAllActive(
            find,
            { paging: { limit: 300, offset: 0 } }
        );

        const sorted = [...countries].sort((a, b) =>
            a.name.localeCompare(b.name)
        );
        return { data: this.countryService.mapShort(sorted) };
    }

    @CountryAdminListDoc()
    @ResponsePaging('country.list')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @PaginationQuery({ availableSearch: COUNTRY_DEFAULT_AVAILABLE_SEARCH })
        { _search, _limit, _offset, _order }: PaginationListDto,
       @PaginationQueryFilterInEnum(
                   'status',
                   COUNTRY_DEFAULT_STATUS,
                   ENUM_COUNTRY_STATUS
               )
               status: Record<string, any>,
    ): Promise<IResponsePaging<CountryListResponseDto>> {
        const find: Record<string, any> = {
            ..._search, ...status
        };
        const countrys: CountryDoc[] = await this.countryService.findAll(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        const total: number = await this.countryService.getTotal(find);
        const totalPage: number = this.paginationService.totalPage(
            total,
            _limit
        );
        const mapCountrys: CountryListResponseDto[] =
            this.countryService.mapList(countrys);

        return {
            _pagination: { total, totalPage },
            data: mapCountrys,
        };
    }

    @CountryAdminGetDoc()
    @Response('country.get')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/get/:country')
    async get(
        @Param('country', RequestRequiredPipe, CountryParsePipe)
        country: CountryDoc
    ): Promise<IResponse<CountryGetResponseDto>> {
        const mapCountry: CountryGetResponseDto =
            this.countryService.mapGet(country);

        return { data: mapCountry };
    }

    @CountryAdminCreateDoc()
    @Response('country.create')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @Body()
        countryCreateRequestDto: CountryCreateRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        // If exists & soft-deleted → restore
        const { name, country_code } = countryCreateRequestDto;
        const slug= await this.countryService.slugify(name);
        // 1. Check if soft-deleted doc with exact match exists
        const softDeletedMatch = await this.countryService.findOne(
            {
                $or: [{ slug }, { country_code }],
                deleted: true,
            },
            { withDeleted: true }
        );

        if (softDeletedMatch) {
            // restore first
            const restored =
                await this.countryService.restore(softDeletedMatch);

            // then update status (or any other mutable fields) from the payload
            await this.countryService.update(restored, countryCreateRequestDto);

            return { data: { _id: String(restored._id) } };
        }

        const exist = await this.countryService.findOne(
            {
                $or: [
                    { slug},
                    { country_code: countryCreateRequestDto.country_code },
                ],
            },
            { withDeleted: true } //custom option to include soft-deleted 
        );

        if (exist && !exist.deleted) {
            throw new ConflictException({
                statusCode: ENUM_COUNTRY_STATUS_CODE_ERROR.EXIST,
                message: 'country.error.exist', //country name or country code already exists
            });
        }

        //  If not exists → create new
        const create = await this.countryService.create(
            countryCreateRequestDto
        );

        return {
            data: { _id: String(create._id) },
        };
    }

    @CountryAdminUpdateDoc()
    @Response('country.update')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/update/:country')
    async update(
        @Param('country', RequestRequiredPipe, CountryParsePipe)
        country: CountryDoc,
        @Body()
        countryUpdateRequestDto: CountryUpdateRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
      // We are not allowing update payload with name and country_code that already exists even if it is soft-deleted
        const { name, country_code } = countryUpdateRequestDto; 
        const slug = await this.countryService.slugify(name);
        const exist = await this.countryService.findOne(
            {
              $or: [{ slug }, { country_code }],
              _id: { $ne: country._id }, // exclude current doc
            },
            { withDeleted: true } //custom option to include soft-deleted
          );

          if (exist) {
            throw new ConflictException({
              statusCode: ENUM_COUNTRY_STATUS_CODE_ERROR.EXIST,
              message: 'country.error.exist',
            });
          }
        
        await this.countryService.update(country, countryUpdateRequestDto);

        return {
            data: { _id: String(country._id) },
        };
    }

    @CountryAdminUpdateStatusDoc()
    @Response('country.updateStatus')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Patch('/update/:country/status')
    async updateStatus(
        @Param('country', RequestRequiredPipe, CountryParsePipe)
        country: CountryDoc,
        @Body() { status }: CountryUpdateStatusRequestDto
    ): Promise<IResponse<void>> {
        if (country.status === ENUM_COUNTRY_STATUS.BLOCKED) {
            throw new BadRequestException({
                statusCode: ENUM_COUNTRY_STATUS_CODE_ERROR.STATUS_INVALID,
                message: 'country.error.statusInvalid',
                _metadata: {
                    customProperty: {
                        messageProperties: {
                            status: status.toLowerCase(),
                        },
                    },
                },
            });
        }

        try {
            await this.countryService.updateStatus(country, { status });

            return {
                _metadata: {
                    customProperty: {
                        messageProperties: {
                            status: status.toLowerCase(),
                        },
                    },
                },
            };
        } catch (err: unknown) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }

    @CountryAdminDeleteDoc()
    @Response('country.delete')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Delete('/delete/:country')
    async delete(
        @Param(
            'country',
            RequestRequiredPipe,
            CountryParsePipe,
            CountryIsUsedPipe
        )
        country: CountryDoc
    ): Promise<void> {
        // Refuse to orphan the tree below. States and cities carry `country_id`
        // as a plain uuid (no FK, because this master soft-deletes), so nothing
        // at the database level would stop the rows from silently losing their
        // parent and rendering a blank country column forever after.
        const countryId = String(country._id);
        const [states, cities] = await Promise.all([
            this.stateRepository.countByCountry(countryId),
            this.cityRepository.countByCountry(countryId),
        ]);

        if (states > 0 || cities > 0) {
            const parts = [
                states > 0 ? `${states} state(s)` : null,
                cities > 0 ? `${cities} city/cities` : null,
            ].filter(Boolean);
            throw new BadRequestException(
                `Cannot delete '${country.name}' — ${parts.join(' and ')} belong to it. Delete them first.`
            );
        }

        await this.countryService.softDelete(country);

        return;
    }
}
