import {
    Get,
    Put,
    Body,
    Post,
    Param,
    Delete,
    Controller,
    ConflictException,
    Patch,
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import { UserProtected } from '@modules/user/decorators/user.decorator';
import { CountryIsUsedPipe } from '@modules/country/pipes/country.is-used.pipe';
import { ENUM_COUNTRY_STATUS } from '@modules/country/enums/country.enum';
import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import {COUNTRY_DEFAULT_STATUS} from '@modules/country/constants/country.list.constant';

@ApiTags('modules.admin.country')
@Controller({
    version: '1',
    path: '/country',
})
export class CountryAdminController {
    constructor(
        private readonly paginationService: PaginationService,
        private readonly countryService: CountryService
    ) {}

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
        await this.countryService.softDelete(country);

        return;
    }
}
