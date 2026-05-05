import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { ENUM_QUOTATION_STATUS } from '../../enums/quotation.enum';

export class QuotationLineCreateDto {
    @IsUUID()
    @IsNotEmpty()
    product_id: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    description?: string;

    @IsNumberString({}, { message: 'qty must be a numeric string' })
    @IsNotEmpty()
    qty: string;

    @IsString()
    @IsOptional()
    @MaxLength(30)
    unit?: string;

    @IsNumberString({}, { message: 'unit_price must be a numeric string' })
    @IsNotEmpty()
    unit_price: string;

    @IsNumberString({}, { message: 'discount_pct must be a numeric string' })
    @IsOptional()
    discount_pct?: string;

    @IsNumberString({}, { message: 'tax_pct must be a numeric string' })
    @IsOptional()
    tax_pct?: string;
}

export class QuotationExpenseCreateDto {
    @IsUUID()
    @IsOptional()
    expense_id?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name: string;

    @IsNumberString({}, { message: 'amount must be a numeric string' })
    @IsNotEmpty()
    amount: string;
}

export class QuotationRebateCreateDto {
    @IsUUID()
    @IsOptional()
    rebate_id?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name: string;

    @IsNumberString({}, { message: 'amount must be a numeric string' })
    @IsNotEmpty()
    amount: string;
}

export class QuotationCreateRequestDto {
    @IsUUID()
    @IsOptional()
    lead_id?: string;

    @IsUUID()
    @IsNotEmpty()
    customer_id: string;

    @IsUUID()
    @IsOptional()
    customer_address_id?: string;

    @IsDateString()
    @IsNotEmpty()
    quotation_date: string;

    @IsDateString()
    @IsOptional()
    valid_until?: string;

    @IsUUID()
    @IsNotEmpty()
    currency_id: string;

    @IsNumberString({}, { message: 'exchange_rate must be a numeric string' })
    @IsOptional()
    exchange_rate?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    payment_terms?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    delivery_terms?: string;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    delivery_location?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notes_to_client?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    internal_notes?: string;

    @IsNumberString({}, { message: 'margin_pct must be a numeric string' })
    @IsOptional()
    margin_pct?: string;

    @IsEnum(ENUM_QUOTATION_STATUS)
    @IsOptional()
    status?: ENUM_QUOTATION_STATUS;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuotationLineCreateDto)
    @IsOptional()
    lines?: QuotationLineCreateDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuotationExpenseCreateDto)
    @IsOptional()
    expenses?: QuotationExpenseCreateDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuotationRebateCreateDto)
    @IsOptional()
    rebates?: QuotationRebateCreateDto[];
}
