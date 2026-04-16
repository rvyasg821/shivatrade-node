import {
    ApiHideProperty,
    IntersectionType,
    OmitType,
    PickType,
} from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { UserShortResponseDto } from '@modules/user/dtos/response/user.short.response.dto';

export class UserCensorResponseDto extends IntersectionType(
    OmitType(UserShortResponseDto, ['email', 'country'])
) {
    @ApiHideProperty()
    @Exclude()
    email?: string;

    @ApiHideProperty()
    @Exclude()
    country: string;
}
