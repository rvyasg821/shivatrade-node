import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ContractSignRequestDto {
    @ApiProperty({ description: 'Base64 signature image (PNG/SVG)' })
    @IsString()
    signature_data: string;
}
