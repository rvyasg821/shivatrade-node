import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import { DatabaseObjectIdDto } from '@common/database/dtos/database.object-id.dto';
import {

    IsOptional,
    IsString,
    
    MaxLength,
   
} from 'class-validator';
import { ENUM_COUNTRY_STATUS } from '@modules/country/enums/country.enum';
export class CountryGetResponseDto extends DatabaseObjectIdDto {
    @ApiProperty({
        description: 'Name of country',
        example: faker.location.country(),
        required: true,
    })
    name: string;

    @ApiProperty({
        description: 'Currency code of the country (e.g. USD, INR)',
        example: faker.finance.currencyCode(),
        required: true,
    })
    currency_code: string;

    @ApiProperty({
        description: 'ISO code of the country (e.g. US, IN)',
        example: faker.location.countryCode('alpha-3'),
        required: true,
    })
    country_code: string;

    @ApiProperty({
        description: 'Status of country',
        example: ENUM_COUNTRY_STATUS.ACTIVE,
        enum: ENUM_COUNTRY_STATUS,
        enumName: 'ENUM_COUNTRY_STATUS',
        required: true,
    })
    status: ENUM_COUNTRY_STATUS;
    
    @ApiProperty({
        description: 'Time zone of the country (e.g. Asia/Kolkata)',
        example: 'Asia/Kolkata',
        required: false,
      })
      @IsString()
      @IsOptional()
      @MaxLength(100)
      time_zone: string;

}
