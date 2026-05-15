import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsBoolean,
    IsNumber,
    Min,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    ENUM_REBATE_STATUS,
    ENUM_REBATE_TYPE,
} from '@modules/rebate/enums/rebate.enum';

export class RebateCreateRequestDto {
    @IsString() @IsNotEmpty() @MaxLength(150) name: string;
    @IsString() @IsNotEmpty() @MaxLength(30) code: string;

    @IsEnum(ENUM_REBATE_TYPE) @IsOptional()
    type?: ENUM_REBATE_TYPE;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    pct: number;

    @IsEnum(ENUM_REBATE_STATUS) @IsOptional() status?: ENUM_REBATE_STATUS;
    @IsBoolean() @IsOptional() is_active?: boolean;
}
