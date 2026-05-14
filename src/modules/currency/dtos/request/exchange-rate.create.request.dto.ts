import {
    IsNotEmpty,
    IsString,
    IsDateString,
    IsNumberString,
    Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class ExchangeRateCreateRequestDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/^[A-Z]{3}$/, { message: 'to_currency_code must be 3 uppercase letters (e.g. USD)' })
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim().toUpperCase() : value
    )
    to_currency_code: string;

    @IsString()
    @IsNotEmpty()
    @IsNumberString({}, { message: 'rate must be a numeric string' })
    @Matches(/^\d+(\.\d{1,6})?$/, {
        message: 'rate allows at most 6 decimal places',
    })
    rate: string;

    @IsDateString()
    @IsNotEmpty()
    effective_date: string;
}
