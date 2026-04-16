import { ApiHideProperty, ApiProperty, OmitType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { CompanyGetResponseDto } from '@modules/company/dtos/response/company.get.response.dto';

export class CompanyListResponseDto extends OmitType(CompanyGetResponseDto, [
    'user_id',
    'country_code',
    'deletedAt',
] as const) {
    @ApiHideProperty()
    @Exclude()
    user_id: string;

    @ApiHideProperty()
    @Exclude()
    country_code?: object;

    @ApiHideProperty()
    @Exclude()
    deletedAt?: Date;

    @ApiProperty({
        required: false,
        description: 'User information'
    })
    user?: {
        _id: string;
        name: string;
        first_name?: string;
        last_name?: string;
        email: string;
    };
}