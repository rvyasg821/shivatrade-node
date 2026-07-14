import { ApiProperty } from '@nestjs/swagger';
import {
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';
import { ENUM_CITY_STATUS } from '@modules/city/enums/city.enum';

export class CityCreateRequestDto {
    @ApiProperty({ description: 'Name of the city', example: 'Ahmedabad' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    /** The country is derived from the state — the client never sends it. */
    @ApiProperty({ description: 'Parent state id', required: true })
    @IsUUID()
    @IsNotEmpty()
    state_id: string;

    @ApiProperty({ description: 'Local city code', required: false })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    city_code?: string;

    @ApiProperty({ enum: ENUM_CITY_STATUS, required: false })
    @IsEnum(ENUM_CITY_STATUS)
    @IsOptional()
    status?: ENUM_CITY_STATUS;
}
