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
import { ENUM_DEBIT_NOTE_STATUS } from '../../enums/debit-note.enum';

/** One rejected GRN line the operator wants to override when creating the DN. */
export class DebitNoteCreateLineDto {
    @IsUUID()
    @IsNotEmpty()
    grn_line_id: string;

    @IsNumberString({}, { message: 'returned_qty must be a numeric string' })
    @IsOptional()
    returned_qty?: string;

    @IsNumberString({}, { message: 'unit_price must be a numeric string' })
    @IsOptional()
    unit_price?: string;

    @IsString()
    @IsOptional()
    @MaxLength(300)
    remarks?: string;
}

export class DebitNoteCreateFromGrnDto {
    @IsDateString()
    @IsOptional()
    dn_date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notes?: string;

    // Optional per-line overrides. Omit to take every rejected line at its
    // full rejected qty and the source POV unit price.
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DebitNoteCreateLineDto)
    @IsOptional()
    lines?: DebitNoteCreateLineDto[];
}

export class DebitNoteLineUpdateDto {
    @IsUUID()
    @IsNotEmpty()
    _id: string;

    @IsNumberString({}, { message: 'returned_qty must be a numeric string' })
    @IsOptional()
    returned_qty?: string;

    @IsNumberString({}, { message: 'unit_price must be a numeric string' })
    @IsOptional()
    unit_price?: string;

    @IsString()
    @IsOptional()
    @MaxLength(300)
    remarks?: string;
}

export class DebitNoteUpdateDto {
    @IsDateString()
    @IsOptional()
    dn_date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    notes?: string;

    @IsEnum(ENUM_DEBIT_NOTE_STATUS)
    @IsOptional()
    status?: ENUM_DEBIT_NOTE_STATUS;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DebitNoteLineUpdateDto)
    @IsOptional()
    lines?: DebitNoteLineUpdateDto[];
}
