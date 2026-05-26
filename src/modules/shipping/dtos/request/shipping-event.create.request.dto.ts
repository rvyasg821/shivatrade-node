import {
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import { ENUM_SHIPPING_EVENT_TYPE } from '@modules/shipping/enums/shipping.enum';

/**
 * Operator-added timeline event. System types are rejected (those are
 * emitted only by the service at status flips).
 */
export class ShippingEventCreateRequestDto {
    @IsEnum(ENUM_SHIPPING_EVENT_TYPE)
    type: ENUM_SHIPPING_EVENT_TYPE;

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
