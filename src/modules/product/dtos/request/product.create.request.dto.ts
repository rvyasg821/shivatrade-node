import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsUUID,
    IsBoolean,
    MaxLength,
} from 'class-validator';
import { ENUM_PRODUCT_STATUS } from '@modules/product/enums/product.enum';

export class ProductCreateRequestDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    code: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    name: string;

    @IsUUID()
    @IsNotEmpty()
    category_id: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    specifications?: string;

    @IsString()
    @IsOptional()
    packaging_details?: string;

    @IsString()
    @IsOptional()
    quality_parameters?: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    hsn_code?: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    unit_of_measure?: string;

    @IsEnum(ENUM_PRODUCT_STATUS)
    @IsOptional()
    status?: ENUM_PRODUCT_STATUS;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;
}
