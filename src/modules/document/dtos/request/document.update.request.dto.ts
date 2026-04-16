import { IsString, IsOptional, MaxLength, IsUUID, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ENUM_DOCUMENT_APPROVAL_STATUS } from '../../enums/document.enum';

export class DocumentUpdateRequestDto {
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    @MaxLength(200)
    title?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    @MaxLength(100)
    category_id?: string;

    @ApiPropertyOptional()
    @IsUUID()
    @IsOptional()
    user_id?: string;

    @ApiPropertyOptional()
    @IsUUID()
    @IsOptional()
    location_id?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    expiry_date?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    status?: string;

    @ApiPropertyOptional({ enum: ENUM_DOCUMENT_APPROVAL_STATUS })
    @IsString()
    @IsOptional()
    @IsIn(Object.values(ENUM_DOCUMENT_APPROVAL_STATUS))
    approved_status?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    @MaxLength(500)
    approval_note?: string;
}
