import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class OTPVerifyRequestDto {
    @ApiProperty({
        description: 'Email address associated with the OTP',
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
        description: '6-digit OTP code',
        example: '123456',
        required: true,
        minLength: 6,
        maxLength: 6,
    })
    @IsNotEmpty({ message: 'OTP is required' })
    @IsString({ message: 'OTP must be a string' })
    @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
    @Matches(/^\d{6}$/, { message: 'OTP must contain only digits' })
    @Transform(({ value }) => value?.trim())
    otp: string;
}