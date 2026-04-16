import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class OTPGenerateRequestDto {
    @ApiProperty({
        description: 'Email address to send OTP to',
        example: 'user@example.com',
        required: true,
    })
    @IsEmail({}, { message: 'Please provide a valid email address' })
    @IsNotEmpty({ message: 'Email is required' })
    @IsString({ message: 'Email must be a string' })
    @Transform(({ value }) => {
        if (!value) return value;
        // Handle URL-encoded + sign (appears as space after decoding)
        // Also handle %2B which is the URL-encoded form of +
        let email = value.toString();
        // Replace %2B with + (in case it wasn't auto-decoded)
        email = email.replace(/%2B/gi, '+');
        // Trim and lowercase
        return email.toLowerCase().trim();
    })
    email: string;

    @ApiProperty({
        description: 'OTP',
        example: '123456',
    })
    otp?: string;
}