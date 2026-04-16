import { ApiProperty } from '@nestjs/swagger';
import { faker } from '@faker-js/faker';
import {
    IsNotEmpty,
    IsOptional,
    IsString,
    IsBoolean,
    MaxLength,
    MinLength,
    ValidateIf,
} from 'class-validator';
import { ENUM_COUNTRY_STATUS } from '@modules/country/enums/country.enum';
export class CountryCreateRequestDto {
    @ApiProperty({
        description: 'Name of country',
        example: faker.location.country(),
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(3)
    @MaxLength(100)
    name: string;

 
    @ApiProperty({
        enum: ENUM_COUNTRY_STATUS,
        example: ENUM_COUNTRY_STATUS.ACTIVE,
    })
    @IsOptional()
    status?: ENUM_COUNTRY_STATUS;
  
    
      @ApiProperty({
        description: 'Currency code of the country (e.g. USD, INR)',
        example: faker.finance.currencyCode(),
        required: true,
      })
      @IsString()
      @IsNotEmpty()
      @MaxLength(20)
      currency_code: string;
    
      @ApiProperty({
        description: 'ISO code of the country (e.g. US, IN)',
        example: faker.location.countryCode('alpha-3'),
        required: true,
      })
      @IsString()
      @IsNotEmpty()
      @MaxLength(10)
      country_code: string;
    
      @ApiProperty({
        description: 'Time zone of the country (e.g. Asia/Kolkata)',
        example: 'Asia/Kolkata',
        required: false,
      })
      @IsString()
      @MaxLength(100)
      @IsOptional()
      time_zone: string;
    
}
