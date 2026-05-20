import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Retraction payload (Option D). The reason is mandatory and persisted
 * on the event row so the audit trail explains WHY the entry was struck
 * through. Max length keeps the UI rendering tidy.
 */
export class TrackingEventDeleteRequestDto {
    @ApiProperty({ required: true, type: String, maxLength: 500 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    reason: string;
}
