import { IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class FieldValueUpdateItem {
    @IsString()
    field_id: string;

    @IsString()
    value: string;
}

export class ContractFieldValuesUpdateRequestDto {
    @ApiProperty({ type: [FieldValueUpdateItem] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FieldValueUpdateItem)
    updates: FieldValueUpdateItem[];
}
