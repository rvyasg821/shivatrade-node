import {
    IsDateString,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PoVendorPaymentCreateRequestDto {
    @ApiProperty({ required: true, type: String, example: '2026-06-17' })
    @IsDateString()
    payment_date: string;

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
