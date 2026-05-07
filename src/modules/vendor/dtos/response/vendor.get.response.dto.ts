import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
    ENUM_VENDOR_ADDRESS_TYPE,
    ENUM_VENDOR_BANK_ACCOUNT_TYPE,
    ENUM_VENDOR_STATUS,
} from '@modules/vendor/enums/vendor.enum';
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

export class VendorBankAccountResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) bank_name: string;
    @ApiProperty({ required: false, type: String }) account_holder_name?: string;
    @ApiProperty({ required: true, type: String }) account_number: string;
    @ApiProperty({ required: false, type: String }) ifsc?: string;
    @ApiProperty({ required: false, type: String }) swift_code?: string;
    @ApiProperty({ required: false, type: String }) iban?: string;
    @ApiProperty({ required: true, type: String }) currency_id: string;
    @ApiProperty({ required: false, type: String }) currency_code?: string;
    @ApiProperty({ required: false, type: String }) branch_name?: string;
    @ApiProperty({ required: false, type: String }) branch_address?: string;
    @ApiProperty({ required: true, enum: ENUM_VENDOR_BANK_ACCOUNT_TYPE })
    account_type: ENUM_VENDOR_BANK_ACCOUNT_TYPE;
    @ApiProperty({ required: true, type: Boolean }) is_default: boolean;
    @ApiProperty({ required: false, type: String }) notes?: string;
    @ApiProperty({ required: true, type: Boolean }) is_active: boolean;
}

export class VendorAddressResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, enum: ENUM_VENDOR_ADDRESS_TYPE })
    type: ENUM_VENDOR_ADDRESS_TYPE;
    @ApiProperty({ required: false, type: String }) label?: string;
    @ApiProperty({ required: false, type: String }) address_line1?: string;
    @ApiProperty({ required: false, type: String }) address_line2?: string;
    @ApiProperty({ required: false, type: String }) city?: string;
    @ApiProperty({ required: false, type: String }) state?: string;
    @ApiProperty({ required: false, type: String }) country?: string;
    @ApiProperty({ required: false, type: String }) postcode?: string;
    @ApiProperty({ required: false, type: String }) gstin?: string;
    @ApiProperty({ required: true, type: Boolean }) is_default: boolean;
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
    gstin?: string;

    @ApiProperty({ required: false, type: String })
    pan?: string;

    @ApiProperty({ required: false, type: String })
    vendor_code?: string;

    @ApiProperty({ required: false, type: String })
    payment_terms?: string;

    @ApiProperty({ required: false, type: String })
    incoterms?: string;

    @ApiProperty({ required: true, type: Boolean })
    is_active: boolean;

    @ApiProperty({ required: true, enum: ENUM_VENDOR_STATUS })
    status: ENUM_VENDOR_STATUS;

    @ApiProperty({ required: true, type: [VendorContactResponseDto] })
    contacts: VendorContactResponseDto[];

    @ApiProperty({ required: false, type: [VendorAddressResponseDto] })
    addresses?: VendorAddressResponseDto[];

    @ApiProperty({ required: false, type: [VendorBankAccountResponseDto] })
    bank_accounts?: VendorBankAccountResponseDto[];

    /** Convenience: primary contact's name + email pulled from contacts. */
    @ApiProperty({ required: false, type: String })
    primary_contact_name?: string;

    @ApiProperty({ required: false, type: String })
    primary_contact_email?: string;

    @ApiProperty({ required: false, type: String })
    primary_contact_phone?: string;

    @ApiProperty({ required: false, type: Object })
    primary_contact_country_code?: any;

    @ApiProperty({ required: true, type: Date })
    createdAt: Date;

    @ApiProperty({ required: true, type: Date })
    updatedAt: Date;

    @Exclude()
    soft_delete: boolean;
}
