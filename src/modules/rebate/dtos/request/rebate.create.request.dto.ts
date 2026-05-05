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
    ENUM_REBATE_APPLIES_ON,
    ENUM_REBATE_STATUS,
} from '@modules/rebate/enums/rebate.enum';

export class RebateCreateRequestDto {
    @IsString() @IsNotEmpty() @MaxLength(150) name: string;
    @IsString() @IsNotEmpty() @MaxLength(30) code: string;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0)
    pct: number;

    @IsEnum(ENUM_REBATE_APPLIES_ON) @IsOptional()
    applies_on?: ENUM_REBATE_APPLIES_ON;

    @IsString() @IsOptional() description?: string;

    @IsEnum(ENUM_REBATE_STATUS) @IsOptional() status?: ENUM_REBATE_STATUS;
    @IsBoolean() @IsOptional() is_active?: boolean;
}
