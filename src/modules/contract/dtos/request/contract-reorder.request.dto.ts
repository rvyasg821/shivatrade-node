import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ContractReorderRequestDto {
    @ApiProperty({ type: [String] })
    @IsArray()
    @IsString({ each: true })
    ordered_ids: string[];
}
