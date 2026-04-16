import { ApiHideProperty, OmitType } from '@nestjs/swagger';
//import { Exclude } from 'class-transformer';
import { CountryGetResponseDto } from '@modules/country/dtos/response/country.get.response.dto';

export class CountryListResponseDto extends OmitType(CountryGetResponseDto, [
    //'description',
] as const) {
  
}
