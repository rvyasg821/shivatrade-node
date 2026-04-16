import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { DatabaseHelperQueryContain } from '@common/database/decorators/database.decorator';
import slugify from 'slugify';

import {
    IDatabaseCreateManyOptions,
    IDatabaseCreateOptions,
    IDatabaseDeleteManyOptions,
    IDatabaseDeleteOptions,
    IDatabaseExistsOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseSaveOptions,
    IDatabaseSoftDeleteOptions,
} from '@common/database/interfaces/database.interface';
import { CountryCreateRequestDto } from '@modules/country/dtos/request/country.create.request.dto';
import { CountryUpdateRequestDto } from '@modules/country/dtos/request/country.update.request.dto';
import { CountryUpdateStatusRequestDto } from '@modules/country/dtos/request/country.update-status.request.dto';
import { CountryGetResponseDto } from '@modules/country/dtos/response/country.get.response.dto';
import { CountryListResponseDto } from '@modules/country/dtos/response/country.list.response.dto';
import { CountryShortResponseDto } from '@modules/country/dtos/response/country.short.response.dto';
import { ICountryService } from '@modules/country/interfaces/country.service.interface';
import { CountryDoc, CountryEntity } from '@modules/country/repository/entities/country.entity';
import { CountryRepository } from '@modules/country/repository/repositories/country.repository';
import { ENUM_COUNTRY_STATUS } from '@modules/country/enums/country.enum';

@Injectable()
export class CountryService implements ICountryService {
    constructor(
        private readonly countryRepository: CountryRepository,
    ) { }

    async findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<CountryDoc[]> {
        return this.countryRepository.findAll(find, options);
    }

    async getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.countryRepository.getTotal(find, options);
    }

    async findAllActive(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<CountryDoc[]> {
        return this.countryRepository.findAll(
            { ...find, status: ENUM_COUNTRY_STATUS.ACTIVE },
            options
        );
    }

    async getTotalActive(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number> {
        return this.countryRepository.getTotal(
            { ...find, isActive: true },
            options
        );
    }

    async findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<CountryDoc> {
        return this.countryRepository.findOneById(_id, options);
    }

    async findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<CountryDoc> {
        return this.countryRepository.findOne(find, options);
    }

    async findOneByEmail(
        email: string,
        options?: IDatabaseFindOneOptions
    ): Promise<CountryDoc> {
        return this.countryRepository.findOne<CountryDoc>(
            DatabaseHelperQueryContain('email', email, { fullWord: true }),
            options
        );
    }

    async findOneByName(
        name: string,
        options?: IDatabaseFindOneOptions
    ): Promise<CountryDoc> {
        return this.countryRepository.findOne(
            DatabaseHelperQueryContain('name', name, { fullWord: true }),
            options
        );
    }

    async findOneActiveById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<CountryDoc> {
        return this.countryRepository.findOne({ _id, status: ENUM_COUNTRY_STATUS.ACTIVE }, options);
    }

    async existByName(
        name: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean> {
        return this.countryRepository.exists(
            DatabaseHelperQueryContain('name', name, { fullWord: true }),
            options
        );
    }

    async create(
        { name, currency_code, country_code, status, time_zone }: CountryCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<CountryDoc> {
        const create: CountryEntity = new CountryEntity();
        create.name = name;
        create.slug = await this.slugify(name);
        create.currency_code = currency_code || "";
        create.country_code = country_code;
        create.status = status || ENUM_COUNTRY_STATUS.ACTIVE;
        create.time_zone = time_zone || "";

        return this.countryRepository.create<CountryEntity>(create, options);
    }

    async updateStatus(
        repository: CountryDoc,
        { status }: CountryUpdateStatusRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<CountryEntity> {
        repository.status = status;

        return this.countryRepository.save(repository, options);
    }

    async update(
        repository: CountryDoc,
        { name, currency_code, country_code, status, time_zone }: CountryUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<CountryDoc> {
        if (name) repository.name = name;
        if (name) repository.slug = await this.slugify(name);
        if (currency_code) repository.currency_code = currency_code;
        if (country_code) repository.country_code = country_code;
        if (status) repository.status = status;
        if (time_zone) repository.time_zone = time_zone;

        return this.countryRepository.save(repository, options);
    }

    async delete(
        repository: CountryDoc,
        options?: IDatabaseDeleteOptions
    ): Promise<boolean> {
        await this.countryRepository.delete(
            {
                _id: repository._id,
            },
            options
        );

        return true;
    }

    async softDelete(
        repository: CountryDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<CountryDoc> {
        return this.countryRepository.softDelete(repository, options);
    }

    async deleteMany(
        find?: Record<string, any>,
        options?: IDatabaseDeleteManyOptions
    ): Promise<boolean> {
        await this.countryRepository.deleteMany(find, options);

        return true;
    }

    async createMany(
        data: CountryCreateRequestDto[],
        options?: IDatabaseCreateManyOptions
    ): Promise<boolean> {
        const create: CountryEntity[] = data.map(({ name, status }) => {
            const entity: CountryEntity = new CountryEntity();
            entity.name = name;

            entity.status = status || ENUM_COUNTRY_STATUS.ACTIVE;

            return entity;
        }) as CountryEntity[];

        await this.countryRepository.createMany<CountryEntity>(create, options);

        return true;
    }
    async restore(
        repository: CountryDoc,
        options?: IDatabaseSaveOptions
    ): Promise<CountryDoc> {
        if (!repository) {
            throw new Error('Repository must be a valid document');
        }

        repository.deletedAt = undefined;
        repository.deletedBy = undefined;
        repository.deleted = false;
        repository.updatedAt = new Date();
        if (options?.actionBy) {
            repository.updatedBy =
                typeof options.actionBy === 'string'
                    ? (options.actionBy as any)
                    : (options.actionBy as any);
        }

        return this.countryRepository.save(repository, options);
    }

    
    //Slugify service using npm library 'slugify'. Return value is the basis of comparison and finding docs in the database.Keep track of any future changes in library as it can affect the database search functionality.    
    async slugify(name: string): Promise<string> {
        return slugify(name, {
            lower: true,
            strict: true,
            trim: true,
        });
    }


    mapList(countrys: CountryDoc[] | CountryEntity[]): CountryListResponseDto[] {
        return plainToInstance(
            CountryListResponseDto,
            countrys.map((e: CountryDoc | CountryEntity) =>
                (e as any).toObject ? (e as any).toObject() : e
            )
        );
    }

    mapGet(country: CountryDoc | CountryEntity): CountryGetResponseDto {
        return plainToInstance(
            CountryGetResponseDto,
            (country as any).toObject ? (country as any).toObject() : country
        );
    }

    mapShort(countrys: CountryDoc[] | CountryEntity[]): CountryShortResponseDto[] {
        return plainToInstance(
            CountryShortResponseDto,
            countrys.map((e: CountryDoc | CountryEntity) =>
                (e as any).toObject ? (e as any).toObject() : e
            )
        );
    }
}
