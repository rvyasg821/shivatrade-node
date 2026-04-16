import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AzureEmailConfigDto {
    @ApiProperty({
        description: 'Azure AD Application Client ID',
        example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    })
    @IsString()
    @IsNotEmpty()
    clientId: string;

    @ApiProperty({
        description: 'Azure AD Application Client Secret',
        example: 'your-client-secret-value',
    })
    @IsString()
    @IsNotEmpty()
    clientSecret: string;

    @ApiProperty({
        description: 'Azure AD Tenant ID',
        example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    })
    @IsString()
    @IsNotEmpty()
    tenantId: string;

    @ApiProperty({
        description: 'From email address (must be valid in your Azure tenant)',
        example: 'noreply@yourdomain.com',
    })
    @IsString()
    @IsNotEmpty()
    fromEmail: string;

    @ApiProperty({
        description: 'From name to display in emails',
        example: 'Your Company Name',
    })
    @IsString()
    @IsOptional()
    fromName?: string;
}