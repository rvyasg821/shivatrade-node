import { Type } from 'class-transformer';
import {
    IsArray,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    ValidateNested,
} from 'class-validator';
import { ENUM_RFQ_STATUS } from '../../enums/rfq.enum';

export class RfqCreateFromLeadDto {
    @IsArray() @IsOptional() @IsUUID('all', { each: true })
    vendor_ids?: string[];

    @IsString() @IsOptional() notes?: string;

    @IsString() @IsOptional() rfq_date?: string;
}

export class RfqUpdateDto {
    @IsString() @IsOptional() notes?: string;
    @IsString() @IsOptional() rfq_date?: string;
    @IsEnum(ENUM_RFQ_STATUS) @IsOptional() status?: ENUM_RFQ_STATUS;
}

export class RfqAddVendorsDto {
    @IsArray() @IsUUID('all', { each: true })
    vendor_ids: string[];
}

export class RfqPriceItemDto {
    @IsUUID() @IsNotEmpty() rfq_line_id: string;
    @IsUUID() @IsNotEmpty() vendor_id: string;
    @IsNumberString({}, { message: 'unit_price must be a numeric string' })
    @IsNotEmpty()
    unit_price: string;
    @IsNumberString({}, { message: 'discount_pct must be a numeric string' })
    @IsOptional()
    discount_pct?: string;
    @IsString() @IsOptional() currency_code?: string;
    @IsInt() @IsOptional() lead_time_days?: number;
    @IsInt() @IsOptional() moq?: number;
    @IsString() @IsOptional() notes?: string;
}

export class RfqSetPricesDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RfqPriceItemDto)
    prices: RfqPriceItemDto[];

    // Per-line export checkbox state — the rfq_line_ids that are ticked. When
    // provided, lines in the list are marked checked and all others unchecked.
    @IsArray()
    @IsUUID('all', { each: true })
    @IsOptional()
    checked_line_ids?: string[];
}

export class RfqSelectPriceDto {
    @IsUUID() @IsNotEmpty() rfq_line_id: string;
    @IsUUID() @IsNotEmpty() vendor_id: string;
}
