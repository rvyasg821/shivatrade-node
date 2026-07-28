import {
    IDatabaseCreateManyOptions,
    IDatabaseCreateOptions,
    IDatabaseDeleteManyOptions,
    IDatabaseDeleteOptions,
    IDatabaseExistsOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';
import { CountryCreateRequestDto } from '@modules/country/dtos/request/country.create.request.dto';
import { CountryUpdateRequestDto } from '@modules/country/dtos/request/country.update.request.dto';
import { CountryUpdateStatusRequestDto } from '@modules/country/dtos/request/country.update-status.request.dto';
import { CountryGetResponseDto } from '@modules/country/dtos/response/country.get.response.dto';
import { CountryListResponseDto } from '@modules/country/dtos/response/country.list.response.dto';
import { CountryShortResponseDto } from '@modules/country/dtos/response/country.short.response.dto';
import { CountryDoc, CountryEntity } from '@modules/country/repository/entities/country.entity';

export interface ICountryService {
    findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<CountryDoc[]>;
    getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;
    findAllActive(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<CountryDoc[]>;
    getTotalActive(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;
    findOneById(_id: string, options?: IDatabaseOptions): Promise<CountryDoc>;
    findOne(
        find: Record<string, any>,
        options?: IDatabaseOptions
    ): Promise<CountryDoc>;
    findOneByEmail(
        email: string,
        options?: IDatabaseFindOneOptions
    ): Promise<CountryDoc>;
    findOneByName(name: string, options?: IDatabaseOptions): Promise<CountryDoc>;
    findOneActiveById(
        _id: string,
        options?: IDatabaseOptions
    ): Promise<CountryDoc>;
    existByName(
        name: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean>;
    create(
        { name,currency_code ,country_code, status,time_zone }: CountryCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<CountryDoc>;
    updateStatus(
        repository: CountryDoc,
        { status }: CountryUpdateStatusRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<CountryEntity>;
    update(
        repository: CountryDoc,
        { name,currency_code ,country_code, status }: CountryUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<CountryDoc>;
    delete(
        repository: CountryDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<boolean>;
    softDelete(
        repository: CountryDoc,
        options?: IDatabaseSaveOptions
    ): Promise<CountryDoc>;
    deleteManyByQuery(
        find?: Record<string, any>,
        options?: IDatabaseDeleteManyOptions
    ): Promise<boolean>;
    deleteMany(
        ids: string[],
        deletedBy?: string
    ): Promise<{
        deleted: string[];
        skipped: Array<{ id: string; reason: string }>;
    }>;
    createMany(
        data: CountryCreateRequestDto[],
        options?: IDatabaseCreateManyOptions
    ): Promise<boolean>;
    mapList(roles: CountryDoc[] | CountryEntity[]): CountryListResponseDto[];
    mapGet(role: CountryDoc | CountryEntity): CountryGetResponseDto;
    mapShort(roles: CountryDoc[] | CountryEntity[]): CountryShortResponseDto[];
}
