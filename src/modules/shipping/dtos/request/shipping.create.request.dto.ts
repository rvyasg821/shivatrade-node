import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumberString,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    ENUM_SHIPPING_BILL_TYPE,
    ENUM_SHIPPING_MODE,
} from '@modules/shipping/enums/shipping.enum';

export class ShippingPortSnapshotDto {
    @IsString() @IsOptional() @MaxLength(20) code?: string;
    @IsString() @IsNotEmpty() @MaxLength(150) name: string;
    @IsString() @IsOptional() @MaxLength(20) type?: string;
    @IsString() @IsOptional() @MaxLength(2) country_code?: string;
    @IsString() @IsOptional() @MaxLength(80) state?: string;
}

export class ShippingCreateRequestDto {
    @IsEnum(ENUM_SHIPPING_MODE)
    mode: ENUM_SHIPPING_MODE;

    // ── Parties ──
    @IsUUID()
    @IsNotEmpty()
    customer_id: string;

    @IsUUID()
    @IsOptional()
    consignee_id?: string;

    @IsUUID()
    @IsOptional()
    consignee_address_id?: string;

    @IsObject()
    @IsOptional()
    consignee_snapshot?: any;

    @IsObject()
    @IsOptional()
    customer_snapshot?: any;

    @IsUUID()
    @IsOptional()
    notify_party_id?: string;

    @IsObject()
    @IsOptional()
    notify_party_snapshot?: any;

    // ── Forwarder ──
    @IsUUID()
    @IsOptional()
    forwarder_id?: string;

    // ── Transport document ──
    @IsString() @IsOptional() @MaxLength(60) bl_awb_no?: string;
    @IsDateString() @IsOptional() bl_awb_date?: string;
    @IsString() @IsOptional() @MaxLength(20) bl_awb_type?: string;

    // ── Customs ──
    @IsString() @IsOptional() @MaxLength(60) shipping_bill_no?: string;
    @IsDateString() @IsOptional() shipping_bill_date?: string;

    @IsEnum(ENUM_SHIPPING_BILL_TYPE)
    @IsOptional()
    shipping_bill_type?: ENUM_SHIPPING_BILL_TYPE;

    @IsDateString() @IsOptional() let_export_order_date?: string;
    @IsString() @IsOptional() @MaxLength(60) egm_no?: string;
    @IsDateString() @IsOptional() egm_date?: string;

    // ── Container / vessel / flight ──
    @IsString() @IsOptional() @MaxLength(30) container_no?: string;
    @IsString() @IsOptional() @MaxLength(30) seal_no?: string;
    @IsString() @IsOptional() @MaxLength(20) container_type?: string;
    @IsString() @IsOptional() @MaxLength(80) vessel_name?: string;
    @IsString() @IsOptional() @MaxLength(30) voyage_no?: string;
    @IsString() @IsOptional() @MaxLength(30) flight_no?: string;

    // ── Route ──
    @IsString() @IsOptional() @MaxLength(80) pre_carriage_by?: string;
    @IsString() @IsOptional() @MaxLength(80) place_of_receipt?: string;

    @IsUUID()
    @IsNotEmpty()
    port_of_loading_id: string;

    @ValidateNested()
    @Type(() => ShippingPortSnapshotDto)
    port_of_loading_snapshot: ShippingPortSnapshotDto;

    @IsUUID()
    @IsOptional()
    port_of_discharge_id?: string;

    @ValidateNested()
    @Type(() => ShippingPortSnapshotDto)
    port_of_discharge_snapshot: ShippingPortSnapshotDto;

    @IsString() @IsOptional() @MaxLength(80) place_of_delivery?: string;
    @IsString() @IsOptional() @MaxLength(80) country_of_origin?: string;

    @IsString() @IsNotEmpty() @MaxLength(80) country_of_destination: string;

    // ── Dates ──
    @IsDateString() @IsOptional() booking_date?: string;
    @IsDateString() @IsOptional() gate_in_date?: string;
    @IsDateString() @IsOptional() etd?: string;
    @IsDateString() @IsOptional() eta?: string;

    // ── Cargo ──
    @IsInt() @Min(0) @IsOptional() total_packages?: number;
    @IsString() @IsOptional() @MaxLength(40) package_type?: string;
    @IsNumberString() @IsOptional() net_weight_kg?: string;
    @IsNumberString() @IsOptional() gross_weight_kg?: string;
    @IsNumberString() @IsOptional() volume_cbm?: string;
    @IsString() @IsOptional() marks_and_nos?: string;

    // ── Marine insurance ──
    @IsString() @IsOptional() @MaxLength(60) marine_insurance_policy_no?: string;
    @IsString() @IsOptional() @MaxLength(120) insurance_company?: string;
    @IsNumberString() @IsOptional() policy_amount_inr?: string;

    // ── Costs (INR) ──
    @IsNumberString() @IsOptional() freight_charges_inr?: string;
    @IsNumberString() @IsOptional() insurance_charges_inr?: string;
    @IsNumberString() @IsOptional() cha_charges_inr?: string;
    @IsNumberString() @IsOptional() forwarder_charges_inr?: string;
    @IsNumberString() @IsOptional() other_charges_inr?: string;

    // ── Notes ──
    @IsString() @IsOptional() notes?: string;
    @IsString() @IsOptional() internal_notes?: string;

    // ── Linked invoices (optional at create; can attach later) ──
    @IsArray()
    @IsOptional()
    @IsUUID('all', { each: true })
    invoice_ids?: string[];
}
