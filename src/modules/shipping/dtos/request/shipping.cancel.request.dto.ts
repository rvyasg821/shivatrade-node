import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ShippingCancelRequestDto {
    @IsString()
    @IsOptional()
    @MaxLength(500)
    reason?: string;
}
