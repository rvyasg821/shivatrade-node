import {
    IsDateString,
    IsNotEmpty,
    IsNumberString,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InvoicePaymentCreateRequestDto {
    @ApiProperty({ required: true, type: String, example: '2026-05-28' })
    @IsDateString()
    payment_date: string;

    @ApiProperty({ required: true, type: String, example: '5000.00' })
    @IsNumberString()
    @IsNotEmpty()
    amount: string;

    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    @MaxLength(30)
    method?: string;

    /** Company bank account this receipt was received into. */
    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    company_bank_account_id?: string;

    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    @MaxLength(120)
    reference?: string;

    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    notes?: string;
}

export class InvoicePaymentVoidRequestDto {
    @ApiProperty({ required: false, type: String })
    @IsOptional()
    @IsString()
    reason?: string;
}
