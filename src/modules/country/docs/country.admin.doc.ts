import { applyDecorators, HttpStatus } from '@nestjs/common';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import {
    Doc,
    DocAuth,
    DocRequest,
    DocGuard,
    DocResponse,
    DocResponsePaging,
} from '@common/doc/decorators/doc.decorator';
import { ENUM_DOC_REQUEST_BODY_TYPE } from '@common/doc/enums/doc.enum';
import { CountryDocParamsId, CountryDocQueryStatus } from '@modules/country/constants/country.doc.constant';
import { CountryListResponseDto } from '@modules/country/dtos/response/country.list.response.dto';
import { CountryGetResponseDto } from '@modules/country/dtos/response/country.get.response.dto';
import { CountryCreateRequestDto } from '@modules/country/dtos/request/country.create.request.dto';
import { CountryUpdateRequestDto } from '@modules/country/dtos/request/country.update.request.dto';
import { CountryUpdateStatusRequestDto } from '@modules/country/dtos/request/country.update-status.request.dto';

export function CountryAdminListDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get all of countries',
        }),
        DocRequest({
            queries: [...CountryDocQueryStatus],
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponsePaging<CountryListResponseDto>('country.list', {
            dto: CountryListResponseDto,
        })
    );
}

export function CountryAdminGetDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'get detail a country',
        }),
        DocRequest({
            params: CountryDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse<CountryGetResponseDto>('country.get', {
            dto: CountryGetResponseDto,
        })
    );
}

export function CountryAdminCreateDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'create a country',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocRequest({
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: CountryCreateRequestDto,
        }),
        DocGuard({ role: true }),
        DocResponse<DatabaseIdResponseDto>('country.create', {
            httpStatus: HttpStatus.CREATED,
            dto: DatabaseIdResponseDto,
        })
    );
}

export function CountryAdminUpdateDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'update data a country',
        }),
        DocRequest({
            params: CountryDocParamsId,
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: CountryUpdateRequestDto,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse<DatabaseIdResponseDto>('country.update', {
            dto: DatabaseIdResponseDto,
        })
    );
}

export function CountryAdminUpdateStatusDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'update status of country',
        }),
        DocRequest({
            params: CountryDocParamsId,
            bodyType: ENUM_DOC_REQUEST_BODY_TYPE.JSON,
            dto: CountryUpdateStatusRequestDto,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('country.updateStatus')
    );
}

export function CountryAdminDeleteDoc(): MethodDecorator {
    return applyDecorators(
        Doc({
            summary: 'delete data a country',
        }),
        DocRequest({
            params: CountryDocParamsId,
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        DocGuard({ role: true }),
        DocResponse('country.delete')
    );
}
