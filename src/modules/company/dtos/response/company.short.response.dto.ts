import { ApiHideProperty, OmitType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { CompanyListResponseDto } from '@modules/company/dtos/response/company.list.response.dto';

export class CompanyShortResponseDto extends OmitType(CompanyListResponseDto, [
    'mobile',
    'website',
    'user',
    'createdAt',
    'updatedAt',
] as const) {
    @ApiHideProperty()
    @Exclude()
    mobile?: string;

    @ApiHideProperty()
    @Exclude()
    website?: string;

    @ApiHideProperty()
    @Exclude()
    user?: {
        _id: string;
        name: string;
        first_name?: string;
        last_name?: string;
        email: string;
    };

    @ApiHideProperty()
    @Exclude()
    createdAt: Date;

    @ApiHideProperty()
    @Exclude()
    updatedAt: Date;
}