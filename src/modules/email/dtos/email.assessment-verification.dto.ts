import { ApiProperty } from '@nestjs/swagger';

export class AssessmentEmailVerificationDto {
    @ApiProperty({
        required: true,
        description: 'The OTP code',
    })
    otp: string;
}
