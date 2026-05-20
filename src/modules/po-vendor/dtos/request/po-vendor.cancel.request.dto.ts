import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PoVendorCancelRequestDto {
    /** Optional reason — appended to internal_notes for audit trail. */
    @IsString()
    @IsOptional()
    @MaxLength(500)
    reason?: string;
}
