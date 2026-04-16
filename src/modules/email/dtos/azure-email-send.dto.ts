import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';
import { faker } from '@faker-js/faker';

export class AzureEmailSendDto {
    @ApiProperty({
        description: 'Recipient email address',
        example: faker.internet.email(),
    })
    @IsEmail()
    @IsNotEmpty()
    to: string;

    @ApiProperty({
        description: 'Recipient name',
        example: faker.person.fullName(),
        required: false,
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({
        description: 'CC recipients (comma-separated)',
        example: 'cc1@example.com,cc2@example.com',
        required: false,
    })
    @IsString()
    @IsOptional()
    cc?: string;

    @ApiProperty({
        description: 'BCC recipients (comma-separated)',
        example: 'bcc1@example.com,bcc2@example.com',
        required: false,
    })
    @IsString()
    @IsOptional()
    bcc?: string;

    @ApiProperty({
        description: 'Email subject',
        example: 'Welcome to our platform',
    })
    @IsString()
    @IsNotEmpty()
    subject: string;

    @ApiProperty({
        description: 'Email content (HTML format)',
        example: '<h1>Welcome!</h1><p>Thank you for joining us.</p>',
    })
    @IsString()
    @IsNotEmpty()
    content: string;

    @ApiProperty({
        description: 'File path for attachment (relative to public folder)',
        example: 'documents/welcome-guide.pdf',
        required: false,
    })
    @IsString()
    @IsOptional()
    filePath?: string;
}