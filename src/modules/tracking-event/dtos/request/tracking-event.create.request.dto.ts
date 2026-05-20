import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsUUID,
    MaxLength,
    IsIn,
    IsISO8601,
} from 'class-validator';
import {
    ENUM_TRACKING_EVENT_TYPE,
    TRACKING_EVENT_TYPE_VALUES,
} from '../../enums/tracking-event.enum';

/**
 * Create payload. `attachment_url` is NOT in this DTO - the controller
 * fills it from the uploaded multipart file. Submitting without a file
 * is allowed (attachment is optional, §13).
 */
export class TrackingEventCreateRequestDto {
    @ApiProperty({ required: true, type: String })
    @IsUUID()
    @IsNotEmpty()
    po_vendor_id: string;

    @ApiProperty({ required: true, type: String, format: 'date-time' })
    @IsISO8601()
    @IsNotEmpty()
    event_at: string;

    @ApiProperty({
        required: true,
        enum: ENUM_TRACKING_EVENT_TYPE,
    })
    @IsString()
    @IsIn(TRACKING_EVENT_TYPE_VALUES)
    event_type: string;

    @ApiProperty({ required: false, type: String, maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    event_type_other?: string;

    @ApiProperty({ required: false, type: String, maxLength: 200 })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    location?: string;

    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    notes?: string;
}
