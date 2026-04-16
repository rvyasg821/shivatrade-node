import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class ToolProvisioningResultResponseDto {
    @ApiProperty({
        description: 'Subscription ID that was provisioned',
        example: '507f1f77bcf86cd799439011',
    })
    @Expose()
    subscriptionId: string;

    @ApiProperty({
        description: 'Tenant ID where tools were provisioned',
        example: '507f1f77bcf86cd799439014',
    })
    @Expose()
    tenantId: string;

    @ApiProperty({
        description: 'List of provisioned tool IDs',
        example: ['507f1f77bcf86cd799439015', '507f1f77bcf86cd799439016'],
    })
    @Expose()
    provisionedTools: string[];

    @ApiProperty({
        description: 'List of created schedule IDs',
        example: ['507f1f77bcf86cd799439017', '507f1f77bcf86cd799439018'],
    })
    @Expose()
    createdSchedules: string[];

    @ApiProperty({
        description: 'Provisioning status',
        example: 'success',
        enum: ['success', 'partial', 'failed'],
    })
    @Expose()
    status: 'success' | 'partial' | 'failed';

    @ApiProperty({
        description: 'List of errors if any occurred during provisioning',
        example: ['Failed to create schedule for tool X'],
        required: false,
    })
    @Expose()
    errors?: string[];
}