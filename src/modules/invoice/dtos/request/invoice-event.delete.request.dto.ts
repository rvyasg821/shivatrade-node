import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Retract a manual invoice event. Reason is mandatory — preserves
 * chain-of-custody alongside the soft-deleted row.
 */
export class InvoiceEventDeleteRequestDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    reason: string;
}
