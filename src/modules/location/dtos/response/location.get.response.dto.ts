import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Exclude, Type } from 'class-transformer';
import { ENUM_LOCATION_STATUS } from '@modules/location/enums/location.enum';
import { IBusinessHours, IWeeklyBusinessHours } from '@modules/location/repository/entities/location.entity';

export class LocationGetResponseDto {
    @ApiProperty({
        required: true,
        type: String,
    })
    _id: string;

    @ApiProperty({
        required: true,
        type: String,
    })
    company_id: string;

    @ApiProperty({
        required: false,
        type: String,
    })
    created_by?: string;

    @ApiProperty({
        required: true,
        type: String,
    })
    location_name: string;

    @ApiProperty({
        required: true,
        type: String,
    })
    location_code: string;

    @ApiProperty({
        required: false,
        type: String,
    })
    description?: string;

    // Contact Information
    @ApiProperty({
        required: true,
        type: String,
    })
    contact_name: string;

    @ApiProperty({
        required: true,
        type: String,
    })
    email: string;

    @ApiProperty({
        required: false,
        type: String,
    })
    mobile?: string;

    @ApiProperty({
        required: false,
        type: Object,
    })
    country_code?: {
        code: string;
        dialCode: string;
    };

    @ApiProperty({
        required: false,
        type: String,
    })
    phone?: string;

    // Address
    @ApiProperty({
        required: false,
        type: String,
    })
    address_line1?: string;

    @ApiProperty({
        required: false,
        type: String,
    })
    address_line2?: string;

    @ApiProperty({
        required: false,
        type: String,
    })
    city?: string;

    @ApiProperty({
        required: false,
        type: String,
    })
    state?: string;

    @ApiProperty({
        required: false,
        type: String,
    })
    postcode?: string;

    @ApiProperty({
        required: false,
        type: String,
    })
    country?: string;

    // GPS Coordinates
    @ApiProperty({
        required: false,
        type: Number,
    })
    latitude?: number;

    @ApiProperty({
        required: false,
        type: Number,
    })
    longitude?: number;

    // Settings
    @ApiProperty({
        required: false,
        type: String,
    })
    timezone?: string;

    @ApiProperty({
        required: false,
        type: String,
    })
    currency?: string;

    @ApiProperty({
        required: false,
        type: Object,
    })
    business_hours?: IWeeklyBusinessHours;

    // Notification Settings
    @ApiProperty({
        required: false,
        type: String,
    })
    notification_email?: string;

    @ApiProperty({
        required: false,
        type: Boolean,
    })
    cc_company_admin?: boolean;

    @ApiProperty({
        required: false,
        type: String,
    })
    notification_email_cc?: string;

    // Status & Flags
    @ApiProperty({
        required: true,
        type: Boolean,
    })
    is_default: boolean;

    @ApiProperty({
        required: true,
        type: Boolean,
    })
    is_active: boolean;

    @ApiProperty({
        required: true,
        enum: ENUM_LOCATION_STATUS,
    })
    status: ENUM_LOCATION_STATUS;

    @ApiProperty({
        required: true,
        type: Date,
    })
    createdAt: Date;

    @ApiProperty({
        required: true,
        type: Date,
    })
    updatedAt: Date;

    @Exclude()
    soft_delete: boolean;
}
