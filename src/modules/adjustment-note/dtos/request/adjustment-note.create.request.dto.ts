import { ApiProperty } from '@nestjs/swagger';
import {
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';
import {
    ENUM_ADJUSTMENT_PARTY_TYPE,
    ENUM_ADJUSTMENT_DIRECTION,
} from '../../enums/adjustment-note.enum';

export class AdjustmentNoteCreateRequestDto {
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

    /** In the party's currency (customer: their currency; vendor: INR). */
    @ApiProperty({ type: String, example: '2000.00' })
    @IsNumberString({}, { message: 'amount must be a numeric string' })
    @IsNotEmpty()
    amount: string;

    /**
     * GST rate %, e.g. '12'. Honoured ONLY on a vendor + debit note; ignored
     * (stored null) for any other party/direction combination. The server
     * computes `gst_amount = round2(amount × gst_rate / 100)`.
     */
    @ApiProperty({ required: false, type: String, example: '12' })
    @IsOptional()
    @IsNumberString({}, { message: 'gst_rate must be a numeric string' })
    gst_rate?: string;

    @ApiProperty({ type: String })
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    reason: string;
}
