import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Retract a manual shipping event. Reason is mandatory — preserves
 * chain-of-custody alongside the soft-deleted row.
 */
export class ShippingEventDeleteRequestDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    reason: string;
}
