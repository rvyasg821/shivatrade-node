import {
    ApiHideProperty,
    ApiProperty,
    getSchemaPath,
    OmitType,
} from '@nestjs/swagger';
import { Exclude, Type } from 'class-transformer';
import { RoleListResponseDto } from '@modules/role/dtos/response/role.list.response.dto';
import {
    ENUM_USER_GENDER,
    ENUM_USER_SIGN_UP_FROM,
} from '@modules/user/enums/user.enum';
import { UserGetResponseDto } from '@modules/user/dtos/response/user.get.response.dto';

export class UserListResponseDto extends OmitType(UserGetResponseDto, [
    'passwordExpired',
    'passwordCreated',
    'signUpDate',
    'signUpFrom',
    'gender',
    'role',
] as const) {
    @ApiProperty({
        required: true,
        type: RoleListResponseDto,
        oneOf: [{ $ref: getSchemaPath(RoleListResponseDto) }],
    })
    @Type(() => RoleListResponseDto)
    role: RoleListResponseDto;

    @ApiHideProperty()
    @Exclude()
    passwordExpired: Date;

    @ApiHideProperty()
    @Exclude()
    passwordCreated: Date;

    @ApiHideProperty()
    @Exclude()
    signUpDate: Date;

    @ApiHideProperty()
    @Exclude()
    signUpFrom: ENUM_USER_SIGN_UP_FROM;

    @ApiHideProperty()
    @Exclude()
    gender?: ENUM_USER_GENDER;
}
