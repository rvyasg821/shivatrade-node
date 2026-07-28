import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsBoolean,
    MaxLength,
} from 'class-validator';
import { ENUM_VENDOR_CATEGORY_STATUS } from '@modules/vendor-category/enums/vendor-category.enum';

export class VendorCategoryCreateRequestDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    name: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    code?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsEnum(ENUM_VENDOR_CATEGORY_STATUS)
    @IsOptional()
    status?: ENUM_VENDOR_CATEGORY_STATUS;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;
}
