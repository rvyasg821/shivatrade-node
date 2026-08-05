import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMinSize,
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
import {
    ENUM_ADJUSTMENT_PARTY_TYPE,
    ENUM_ADJUSTMENT_DIRECTION,
} from '../../enums/adjustment-note.enum';

/**
 * One allocation line of a batch adjustment-note post. Each line becomes its
 * OWN adjustment note (its own voucher), sharing the batch header's party /
 * type / date / reason. The document link stays REFERENCE-ONLY — it does not
 * move the invoice/POV balance (client rule 2026-08-03).
 */
export class AdjustmentNoteBatchLineDto {
    /** In the party's currency (customer: their currency; vendor: INR). */
    @ApiProperty({ type: String, example: '2000.00' })
    @IsNumberString({}, { message: 'amount must be a numeric string' })
    @IsNotEmpty()
    amount: string;

    /** GST rate % — honoured only on a vendor + debit note (see single create). */
    @ApiProperty({ required: false, type: String, example: '12' })
    @IsOptional()
    @IsNumberString({}, { message: 'gst_rate must be a numeric string' })
    gst_rate?: string;

    /** OPTIONAL — Invoice (customer) or Vendor PO (vendor) this line references. */
    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsUUID()
    document_id?: string;
}

/**
 * Post several adjustment notes for one party in a single action. The header
 * fields are entered once; each `lines[]` entry produces a separate note.
 */
export class AdjustmentNoteBatchCreateRequestDto {
    @ApiProperty({ enum: ENUM_ADJUSTMENT_PARTY_TYPE, example: 'customer' })
    @IsEnum(ENUM_ADJUSTMENT_PARTY_TYPE)
    party_type: ENUM_ADJUSTMENT_PARTY_TYPE;

    @ApiProperty({ type: String })
    @IsUUID()
    @IsNotEmpty()
    party_id: string;

    @ApiProperty({ enum: ENUM_ADJUSTMENT_DIRECTION, example: 'credit' })
    @IsEnum(ENUM_ADJUSTMENT_DIRECTION)
    direction: ENUM_ADJUSTMENT_DIRECTION;

    @ApiProperty({ type: String, example: '2026-07-16' })
    @IsDateString()
    note_date: string;

    @ApiProperty({ type: String })
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    reason: string;

    @ApiProperty({ type: [AdjustmentNoteBatchLineDto] })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => AdjustmentNoteBatchLineDto)
    lines: AdjustmentNoteBatchLineDto[];
}
