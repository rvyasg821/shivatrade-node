import {
    IsNotEmpty,
    IsUUID,
    IsString,
    IsDateString,
    IsNumberString,
} from 'class-validator';

export class ExchangeRateCreateRequestDto {
    @IsUUID()
    @IsNotEmpty()
    to_currency_id: string;

    @IsString()
    @IsNotEmpty()
    @IsNumberString({}, { message: 'rate must be a numeric string' })
    rate: string;

    @IsDateString()
    @IsNotEmpty()
    effective_date: string;
}
