import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
    ENUM_LEAD_SOURCE,
    ENUM_LEAD_STATUS,
} from '@modules/lead/enums/lead.enum';
import { LeadLineResponseDto } from './lead-line.response.dto';

export class LeadGetResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) company_id: string;
    @ApiProperty({ required: false, type: String }) voucher_no?: string;
    @ApiProperty({ required: false, type: String }) created_by?: string;

    @ApiProperty({ required: false, type: String }) customer_id?: string;
    @ApiProperty({ required: false, type: String }) customer_name?: string;

    @ApiProperty({ required: true, type: String }) company_name: string;
    @ApiProperty({ required: true, type: String }) contact_name: string;
    @ApiProperty({ required: true, type: String }) contact_email: string;
    @ApiProperty({ required: false, type: String }) contact_phone?: string;
    @ApiProperty({ required: false, type: Object })
    country_code?: { code: string; dialCode: string };

    @ApiProperty({ required: true, enum: ENUM_LEAD_SOURCE })
    source: ENUM_LEAD_SOURCE;

    @ApiProperty({ required: true, type: [String] })
    interested_categories: string[];

    @ApiProperty({ required: false, type: [String] })
    interested_products?: string[];

    // Requirement line items (replaces interested_categories/products).
    @ApiProperty({ required: false, type: [LeadLineResponseDto] })
    lines?: LeadLineResponseDto[];

    @ApiProperty({ required: false, type: Number }) expected_value?: number;
    @ApiProperty({ required: false, type: String }) currency?: string;

    @ApiProperty({ required: false, type: String }) website_url?: string;
    @ApiProperty({ required: false, type: Object })
    social_media_urls?: Record<string, string>;
    @ApiProperty({ required: false, type: String }) quantity?: string;
    @ApiProperty({ required: false, type: String }) delivery_expectation?: string;
    @ApiProperty({ required: false, type: [String] }) preferred_vendors?: string[];
    @ApiProperty({ required: false, type: String }) follow_up_date?: string;

    @ApiProperty({ required: false, type: String }) assigned_to?: string;
    @ApiProperty({ required: false, type: String }) assigned_to_name?: string;
    @ApiProperty({ required: false, type: Number }) quotations_count?: number;

    @ApiProperty({ required: false, type: String }) description?: string;
    @ApiProperty({ required: false, type: String }) last_activity_at?: string;

    @ApiProperty({ required: false, type: String }) address_line1?: string;
    @ApiProperty({ required: false, type: String }) address_line2?: string;
    @ApiProperty({ required: false, type: String }) city?: string;
    @ApiProperty({ required: false, type: String }) state?: string;
    @ApiProperty({ required: false, type: String }) country?: string;
    @ApiProperty({ required: false, type: String }) postcode?: string;

    @ApiProperty({ required: true, enum: ENUM_LEAD_STATUS })
    status: ENUM_LEAD_STATUS;

    @ApiProperty({ required: true, type: Boolean }) is_active: boolean;

    @ApiProperty({ required: false, type: String }) converted_customer_id?: string;
    @ApiProperty({ required: false, type: Date }) converted_at?: Date;

    @ApiProperty({ required: true, type: Date }) createdAt: Date;
    @ApiProperty({ required: true, type: Date }) updatedAt: Date;

    @Exclude() soft_delete: boolean;
}
