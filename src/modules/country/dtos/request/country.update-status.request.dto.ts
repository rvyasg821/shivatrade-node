import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ENUM_COUNTRY_STATUS } from '@modules/country/enums/country.enum';

export class CountryUpdateStatusRequestDto {
    @ApiProperty({
        required: true,
        enum: ENUM_COUNTRY_STATUS,
        default: ENUM_COUNTRY_STATUS.ACTIVE,
    })
    @IsString()
    @IsEnum(ENUM_COUNTRY_STATUS)
    @IsNotEmpty()
    status: ENUM_COUNTRY_STATUS;
}
