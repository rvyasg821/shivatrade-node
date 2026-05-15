import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsUUID,
    IsBoolean,
    MaxLength,
} from 'class-validator';
import { ENUM_CATEGORY_STATUS } from '@modules/category/enums/category.enum';

export class CategoryCreateRequestDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsUUID()
    @IsOptional()
    parent_id?: string;

    @IsEnum(ENUM_CATEGORY_STATUS)
    @IsOptional()
    status?: ENUM_CATEGORY_STATUS;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;
}
