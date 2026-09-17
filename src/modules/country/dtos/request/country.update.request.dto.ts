import { PartialType } from '@nestjs/swagger';
import { CountryCreateRequestDto } from '@modules/country/dtos/request/country.create.request.dto';

export class CountryUpdateRequestDto extends PartialType(
    CountryCreateRequestDto
) {}
