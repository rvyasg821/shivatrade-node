import { ApiProperty } from '@nestjs/swagger';

export class OTPGenerateResponseDto {
    @ApiProperty({
        description: 'Email address where OTP was sent',
        example: 'user@example.com',
    })
    email: string;

    @ApiProperty({
        description: 'OTP expiration time in seconds',
        example: 300,
    })
    expiresIn: number;
}