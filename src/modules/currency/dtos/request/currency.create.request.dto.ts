import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsBoolean,
    Length,
    MaxLength,
} from 'class-validator';
import { ENUM_CURRENCY_STATUS } from '@modules/currency/enums/currency.enum';

export class CurrencyCreateRequestDto {
    @IsString()
    @IsNotEmpty()
    @Length(3, 3, { message: 'Currency code must be exactly 3 characters' })
    code: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @IsString()
    @IsOptional()
    @MaxLength(10)
    symbol?: string;

    @IsEnum(ENUM_CURRENCY_STATUS)
    @IsOptional()
    status?: ENUM_CURRENCY_STATUS;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    @IsBoolean()
    @IsOptional()
    is_default?: boolean;
}
