import {
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    IsDateString,
    IsNumberString,
    IsInt,
    IsBoolean,
    Min,
    MaxLength,
} from 'class-validator';

export class PriceListCreateRequestDto {
    @IsUUID()
    @IsNotEmpty()
    vendor_id: string;

    @IsUUID()
    @IsNotEmpty()
    product_id: string;

    @IsUUID()
    @IsNotEmpty()
    currency_id: string;

    @IsString()
    @IsNotEmpty()
    @IsNumberString({}, { message: 'unit_price must be a numeric string' })
    unit_price: string;

    @IsInt()
    @IsOptional()
    @Min(1)
    moq?: number;

    @IsString()
    @IsOptional()
    @IsNumberString({}, { message: 'tax_pct must be a numeric string' })
    tax_pct?: string;

    @IsString()
    @IsOptional()
    @IsNumberString({}, { message: 'discount_pct must be a numeric string' })
    discount_pct?: string;

    @IsInt()
    @IsOptional()
    @Min(0)
    lead_time_days?: number;

    @IsDateString()
    @IsNotEmpty()
    effective_date: string;

    @IsDateString()
    @IsOptional()
    valid_until?: string;

    @IsBoolean()
    @IsOptional()
    is_primary?: boolean;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notes?: string;
}
