import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateToolScheduleRequestDto {
    @ApiProperty({
        description: 'Schedule name',
        example: 'Daily Security Scan',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Schedule description',
        example: 'Automated daily security scan at 2 AM',
    })
    @IsString()
    @IsNotEmpty()
    description: string;

    @ApiProperty({
        description: 'Cron expression for scheduling',
        example: '0 2 * * *',
    })
    @IsString()
    @IsNotEmpty()
    cronString: string;

    @ApiProperty({
        description: 'Tenant tool ID that this schedule belongs to',
        example: '507f1f77bcf86cd799439013',
    })
    @IsString()
    @IsNotEmpty()
    tenantToolId: string;

    @ApiProperty({
        description: 'Subscription ID for tracking',
        example: '507f1f77bcf86cd799439011',
    })
    @IsString()
    @IsNotEmpty()
    subscriptionId: string;
}