import { OmitType } from '@nestjs/swagger';
import { CountryCreateRequestDto } from '@modules/country/dtos/request/country.create.request.dto';

export class CountryUpdateRequestDto extends OmitType(CountryCreateRequestDto, [
    // 'email',
] as const) {
}
