import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateTenantToolRequestDto {
    @ApiProperty({
        description: 'Tool name',
        example: 'Wazuh Security Tool',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Tool description',
        example: 'Security monitoring and threat detection tool',
    })
    @IsString()
    @IsNotEmpty()
    description: string;

    @ApiProperty({
        description: 'Subscription ID that this tool belongs to',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsNotEmpty()
    subscriptionId: string;

    @ApiProperty({
        description: 'Original tool ID from the tools collection',
        example: '507f1f77bcf86cd799439012',
    })
    @IsString()
    @IsNotEmpty()
    originalToolId: string;

    @ApiProperty({
        description: 'Tool type',
        example: 'Security Scanner',
        required: false,
    })
    @IsString()
    @IsOptional()
    type?: string;

    @ApiProperty({
        description: 'IP Address or URL',
        example: '192.168.1.100',
        required: false,
    })
    @IsString()
    @IsOptional()
    ipAddressOrUrl?: string;

    @ApiProperty({
        description: 'Port number',
        example: '8080',
        required: false,
    })
    @IsString()
    @IsOptional()
    port?: string;

    @ApiProperty({
        description: 'Username for authentication',
        example: 'admin',
        required: false,
    })
    @IsString()
    @IsOptional()
    username?: string;

    @ApiProperty({
        description: 'Password for authentication',
        example: 'password123',
        required: false,
    })
    @IsString()
    @IsOptional()
    password?: string;

    @ApiProperty({
        description: 'Configuration description',
        example: 'Main security scanner configuration',
        required: false,
    })
    @IsString()
    @IsOptional()
    configDescription?: string;
}