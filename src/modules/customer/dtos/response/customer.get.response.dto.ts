import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
    ENUM_CUSTOMER_ADDRESS_TYPE,
    ENUM_CUSTOMER_STATUS,
} from '@modules/customer/enums/customer.enum';
import { ICustomerSocialMedia } from '@modules/customer/repository/entities/customer.entity';

export class CustomerContactResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) name: string;
    @ApiProperty({ required: false, type: String }) designation?: string;
    @ApiProperty({ required: true, type: String }) email: string;
    @ApiProperty({ required: false, type: String }) phone?: string;
    @ApiProperty({ required: false, type: Object })
    country_code?: { code: string; dialCode: string };
    @ApiProperty({ required: true, type: Boolean }) is_primary: boolean;
}

export class CustomerAddressResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, enum: ENUM_CUSTOMER_ADDRESS_TYPE })
    type: ENUM_CUSTOMER_ADDRESS_TYPE;
    @ApiProperty({ required: false, type: String }) label?: string;
    @ApiProperty({ required: false, type: String }) address_line1?: string;
    @ApiProperty({ required: false, type: String }) address_line2?: string;
    @ApiProperty({ required: false, type: String }) city?: string;
    @ApiProperty({ required: false, type: String }) state?: string;
    @ApiProperty({ required: false, type: String }) country?: string;
    @ApiProperty({ required: false, type: String }) postcode?: string;
    @ApiProperty({ required: false, type: String }) gstin?: string;
    @ApiProperty({ required: false, type: String }) iec?: string;
    @ApiProperty({ required: true, type: Boolean }) is_default: boolean;
}

export class CustomerGetResponseDto {
    @ApiProperty({ required: true, type: String }) _id: string;
    @ApiProperty({ required: true, type: String }) company_id: string;
    @ApiProperty({ required: false, type: String }) created_by?: string;

    @ApiProperty({ required: true, type: String }) company_name: string;
    @ApiProperty({ required: false, type: String }) website?: string;
    @ApiProperty({ required: false, type: Object }) social_media?: ICustomerSocialMedia;

    @ApiProperty({ required: false, type: String }) gstin?: string;
    @ApiProperty({ required: false, type: String }) pan?: string;
    @ApiProperty({ required: false, type: String }) iec?: string;
    @ApiProperty({ required: false, type: String }) currency?: string;
    @ApiProperty({ required: false, type: String }) opening_balance?: string;
    @ApiProperty({ required: false, type: String }) opening_balance_type?: string;
    @ApiProperty({ required: false, type: String }) opening_balance_date?: string;

    @ApiProperty({ required: true, type: Boolean }) is_active: boolean;
    @ApiProperty({ required: true, enum: ENUM_CUSTOMER_STATUS }) status: ENUM_CUSTOMER_STATUS;

    @ApiProperty({ required: true, type: [CustomerContactResponseDto] })
    contacts: CustomerContactResponseDto[];

    @ApiProperty({ required: false, type: [CustomerAddressResponseDto] })
    addresses?: CustomerAddressResponseDto[];

    /** Hydrated from the default-or-first address for listing display.
     *  Computed at mapList time, not stored on the customer entity. */
    @ApiProperty({ required: false, type: String }) country?: string;

    @ApiProperty({ required: false, type: String }) primary_contact_name?: string;
    @ApiProperty({ required: false, type: String }) primary_contact_email?: string;
    @ApiProperty({ required: false, type: String }) primary_contact_phone?: string;
    @ApiProperty({ required: false, type: Object }) primary_contact_country_code?: any;

    @ApiProperty({ required: true, type: Date }) createdAt: Date;
    @ApiProperty({ required: true, type: Date }) updatedAt: Date;

    @Exclude() soft_delete: boolean;
}
