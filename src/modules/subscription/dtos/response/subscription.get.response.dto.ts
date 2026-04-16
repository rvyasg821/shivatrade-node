import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { SubscriptionListResponseDto } from './subscription.list.response.dto';

export class SubscriptionGetResponseDto extends SubscriptionListResponseDto {
    @ApiProperty({
        description: 'Tax label from environment configuration',
        example: 'VAT',
    })
    @Expose()
    tax_label?: string;

    @ApiProperty({
        description: 'Tax percentage from environment configuration',
        example: 5,
    })
    @Expose()
    tax_percentage?: number;
}