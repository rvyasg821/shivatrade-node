import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ENUM_VENDOR_STATUS } from '@modules/vendor/enums/vendor.enum';
import { IVendorSocialMedia } from '@modules/vendor/repository/entities/vendor.entity';

export class VendorContactResponseDto {
    @ApiProperty({ required: true, type: String })
    _id: string;

    @ApiProperty({ required: true, type: String })
    name: string;

    @ApiProperty({ required: false, type: String })
    designation?: string;

    @ApiProperty({ required: true, type: String })
    email: string;

    @ApiProperty({ required: false, type: String })
    phone?: string;

    @ApiProperty({ required: false, type: Object })
    country_code?: { code: string; dialCode: string };

    @ApiProperty({ required: true, type: Boolean })
    is_primary: boolean;
}

export class VendorGetResponseDto {
    @ApiProperty({ required: true, type: String })
    _id: string;

    @ApiProperty({ required: true, type: String })
    company_id: string;

    @ApiProperty({ required: false, type: String })
    created_by?: string;

    @ApiProperty({ required: true, type: String })
    company_name: string;

    @ApiProperty({ required: false, type: String })
    website?: string;

    @ApiProperty({ required: false, type: Object })
    social_media?: IVendorSocialMedia;

    @ApiProperty({
        required: true,
        type: 'array',
        items: { type: 'object', properties: { _id: { type: 'string' }, name: { type: 'string' } } },
    })
    categories: { _id: string; name: string }[];

    @ApiProperty({ required: false, type: String })
    payment_terms?: string;

    @ApiProperty({ required: false, type: String })
    incoterms?: string;

    @ApiProperty({ required: false, type: String })
    address_line1?: string;

    @ApiProperty({ required: false, type: String })
    address_line2?: string;

    @ApiProperty({ required: false, type: String })
    city?: string;

    @ApiProperty({ required: false, type: String })
    state?: string;

    @ApiProperty({ required: false, type: String })
    country?: string;

    @ApiProperty({ required: false, type: String })
    postcode?: string;

    @ApiProperty({ required: true, type: Boolean })
    is_active: boolean;

    @ApiProperty({ required: true, enum: ENUM_VENDOR_STATUS })
    status: ENUM_VENDOR_STATUS;

    @ApiProperty({ required: true, type: [VendorContactResponseDto] })
    contacts: VendorContactResponseDto[];

    /** Convenience: primary contact's name + email pulled from contacts. */
    @ApiProperty({ required: false, type: String })
    primary_contact_name?: string;

    @ApiProperty({ required: false, type: String })
    primary_contact_email?: string;

    @ApiProperty({ required: false, type: String })
    primary_contact_phone?: string;

    @ApiProperty({ required: true, type: Date })
    createdAt: Date;

    @ApiProperty({ required: true, type: Date })
    updatedAt: Date;

    @Exclude()
    soft_delete: boolean;
}
