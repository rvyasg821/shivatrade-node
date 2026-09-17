import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { ENUM_COUNTRY_STATUS_CODE_ERROR } from '@modules/country/enums/country.status-code.enum';
import { CountryDoc } from '@modules/country/repository/entities/country.entity';
import { CountryService } from '@modules/country/services/country.service';

@Injectable()
export class CountryParsePipe implements PipeTransform {
    constructor(private readonly countryService: CountryService) {
    }

    async transform(value: string): Promise<CountryDoc> {
        // A non-UUID value previously threw a raw, uncaught Postgres
        // "invalid input syntax for uuid" error -> unhandled 500 instead of
        // a clean 404 (found via a full-app test pass, live-confirmed on
        // GET /admin/country/get/:country). Mirrors the already-correct
        // ToolsParsePipe.
        let country: CountryDoc | undefined;
        try {
            country = await this.countryService.findOneById(value);
        } catch {
            country = undefined;
        }
        if (!country) {
            throw new NotFoundException({
                statusCode: ENUM_COUNTRY_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'country.error.notFound',
            });
        }

        return country;
    }
}
