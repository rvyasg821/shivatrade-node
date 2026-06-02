import {
    IsString,
    IsOptional,
    IsUUID,
    IsInt,
    MaxLength,
} from 'class-validator';

/**
 * One requirement line on a Lead. `product_id` is optional — a line may be a
 * catalogued product, a category, or pure free-text (`description`).
 * qty / target_price arrive as strings (numeric columns); coerced in service.
 */
export class LeadLineRequestDto {
    @IsUUID() @IsOptional() product_id?: string;
    @IsUUID() @IsOptional() category_id?: string;
    @IsString() @IsOptional() description?: string;
    @IsString() @IsOptional() qty?: string;
    @IsString() @IsOptional() @MaxLength(30) unit?: string;
    @IsString() @IsOptional() target_price?: string;
    @IsString() @IsOptional() @MaxLength(120) customer_reference?: string;
    @IsString() @IsOptional() notes?: string;
    @IsInt() @IsOptional() seq?: number;
}
