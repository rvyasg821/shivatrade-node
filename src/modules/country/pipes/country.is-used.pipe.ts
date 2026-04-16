import { Injectable, PipeTransform } from '@nestjs/common';
import { CountryDoc } from '@modules/country/repository/entities/country.entity';

@Injectable()
export class CountryIsUsedPipe implements PipeTransform {
    constructor() {}

    async transform(value: CountryDoc): Promise<CountryDoc> {

        return value;
    }
}
