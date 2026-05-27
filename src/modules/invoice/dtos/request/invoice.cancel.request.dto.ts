import { IsOptional, IsString, MaxLength } from 'class-validator';

export class InvoiceCancelRequestDto {
    @IsString()
    @IsOptional()
    @MaxLength(500)
    reason?: string;
}
