import { ApiProperty } from '@nestjs/swagger';

export class OTPVerifyResponseDto {
    @ApiProperty({
        description: 'Email address that was verified',
        example: 'user@example.com',
    })
    email: string;

    @ApiProperty({
        description: 'Whether the email was successfully verified',
        example: true,
    })
    verified: boolean;
}