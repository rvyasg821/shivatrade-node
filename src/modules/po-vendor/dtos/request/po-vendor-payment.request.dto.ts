import {
    IsDateString,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PoVendorPaymentCreateRequestDto {
    @ApiProperty({ required: true, type: String, example: '2026-06-17' })
    @IsDateString()
    payment_date: string;

    /** GROSS amount (the vendor's bill). Reduces the POV payable in full;
     *  net_paid = amount − tds_amount is the cash out of the bank. */
    @ApiProperty({ required: true, type: String, example: '50000.00' })
    @IsNumberString()
    @IsNotEmpty()
    amount: string;

    /** The vendor's invoice number this payment is against. */
    @ApiProperty({ required: false, type: String, example: 'VINV-5521' })
    @IsOptional()
    @IsString()
    @MaxLength(120)
    invoice_number?: string;

    // ── Paying company bank account (#7) ──
    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsUUID()
    company_bank_account_id?: string;

    // ── TDS (#7) — Gross → TDS → Net. Optional; omit for no TDS. ──
    @ApiProperty({ required: false, type: String, example: '194C' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    tds_section?: string;

    @ApiProperty({ required: false, type: String, example: '2' })
    @IsOptional()
    @IsNumberString()
    tds_rate_pct?: string;

    /** TDS amount held back. If omitted, the service derives it from
     *  amount × tds_rate_pct. Sent explicitly so the UI's rounding wins. */
    @ApiProperty({ required: false, type: String, example: '1000.00' })
    @IsOptional()
    @IsNumberString()
    tds_amount?: string;

    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    notes?: string;
}

export class PoVendorPaymentVoidRequestDto {
    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    reason?: string;
}
