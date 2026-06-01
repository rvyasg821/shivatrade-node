import {
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import { ENUM_INVOICE_EVENT_TYPE } from '@modules/invoice/enums/invoice.enum';

/**
 * Operator-added invoice tracking event. Manual events only — there are no
 * system-emitted types to reject (SHIPPING_INVOICE_MERGE_PLAN §8).
 */
export class InvoiceEventCreateRequestDto {
    @IsEnum(ENUM_INVOICE_EVENT_TYPE)
    type: ENUM_INVOICE_EVENT_TYPE;

    @IsString()
    @IsOptional()
    @MaxLength(120)
    type_other?: string;

    @IsDateString()
    @IsNotEmpty()
    occurred_at: string;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    location?: string;

    @IsString()
    @IsOptional()
    notes?: string;
}
