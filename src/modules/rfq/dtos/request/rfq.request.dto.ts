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

export class RfqLineQtyDto {
    @IsUUID() @IsNotEmpty() rfq_line_id: string;
    @IsNumberString({}, { message: 'qty must be a numeric string' })
    @IsNotEmpty()
    qty: string;
}

export class RfqSetPricesDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RfqPriceItemDto)
    prices: RfqPriceItemDto[];

    // Optional per-line requirement qty overrides (the editable Qty column on
    // the price-collection grid). Updates the rfq_line.qty for all vendors.
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RfqLineQtyDto)
    @IsOptional()
    line_qtys?: RfqLineQtyDto[];

    // Per-vendor export checkbox state — the rfq_line_ids ticked for the vendor
    // in `checked_vendor_id`. Stored on that vendor's row so each vendor keeps
    // its own selection.
    @IsArray()
    @IsUUID('all', { each: true })
    @IsOptional()
    checked_line_ids?: string[];

    // The vendor the `checked_line_ids` belong to (the active comparison
    // column). Required for the checked set to persist per-vendor.
    @IsUUID()
    @IsOptional()
    checked_vendor_id?: string;
}

export class RfqSelectPriceDto {
    @IsUUID() @IsNotEmpty() rfq_line_id: string;
    @IsUUID() @IsNotEmpty() vendor_id: string;
}
