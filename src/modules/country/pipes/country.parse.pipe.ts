import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { ENUM_COUNTRY_STATUS_CODE_ERROR } from '@modules/country/enums/country.status-code.enum';
import { CountryDoc } from '@modules/country/repository/entities/country.entity';
import { CountryService } from '@modules/country/services/country.service';

@Injectable()
export class CountryParsePipe implements PipeTransform {
    constructor(private readonly countryService: CountryService) {
    }

    async transform(value: string): Promise<CountryDoc> {
        const country: CountryDoc = await this.countryService.findOneById(value);
        if (!country) {
            throw new NotFoundException({
                statusCode: ENUM_COUNTRY_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'country.error.notFound',
            });
        }

        return country;
    }
}
