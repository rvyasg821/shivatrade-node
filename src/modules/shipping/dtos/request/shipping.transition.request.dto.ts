import {
    IsDateString,
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import { ENUM_SHIPPING_STATUS } from '@modules/shipping/enums/shipping.enum';

/**
 * Body for `POST /admin/shipping/:id/transition`.
 *
 * The service inspects `to` and the current status to enforce a forward-only
 * workflow (see SHIPPING_STATUS_TRANSITIONS in shipping.enum). Some target
 * statuses also require date fields per the plan:
 *
 *   booked     → booking_date
 *   dispatched → actual_dispatch_date, requires let_export_order_date set
 *   arrived    → actual_arrival_date
 *   cleared    → customs_cleared_date
 *   delivered  → delivered_date
 */
export class ShippingTransitionRequestDto {
    @IsEnum(ENUM_SHIPPING_STATUS)
    to: ENUM_SHIPPING_STATUS;

    @IsDateString()
    @IsOptional()
    booking_date?: string;

    @IsDateString()
    @IsOptional()
    actual_dispatch_date?: string;

    @IsDateString()
    @IsOptional()
    actual_arrival_date?: string;

    @IsDateString()
    @IsOptional()
    customs_cleared_date?: string;

    @IsDateString()
    @IsOptional()
    delivered_date?: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    notes?: string;
}
