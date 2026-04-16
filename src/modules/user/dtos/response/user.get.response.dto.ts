import { faker } from '@faker-js/faker';
import { ApiHideProperty, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { Exclude, Type } from 'class-transformer';
import {
    ENUM_USER_GENDER,
    ENUM_USER_SIGN_UP_FROM,
    ENUM_USER_STATUS,
} from '@modules/user/enums/user.enum';
import { DatabaseObjectIdDto } from '@common/database/dtos/database.object-id.dto';


export class UserGetResponseDto extends DatabaseObjectIdDto {
    @ApiProperty({
        required: true,
        maxLength: 100,
        minLength: 1,
    })
    name: string;

    @ApiProperty({
        required: false,
        maxLength: 50,
        example: faker.person.firstName(),
        description: 'User first name'
    })
    first_name?: string;

    @ApiProperty({
        required: false,
        maxLength: 50,
        example: faker.person.lastName(),
        description: 'User last name'
    })
    last_name?: string;

    @ApiProperty({
        required: true,
        example: faker.internet.email(),
        maxLength: 100,
    })
    email: string;

    @ApiProperty({
        required: true,
        example: faker.string.uuid(),
    })
    role: string;

    @ApiHideProperty()
    @Exclude()
    password: string;

    @ApiProperty({
        required: true,
        example: faker.date.future(),
    })
    passwordExpired: Date;

    @ApiProperty({
        required: true,
        example: faker.date.past(),
    })
    passwordCreated: Date;

    @ApiHideProperty()
    @Exclude()
    passwordAttempt: number;

    @ApiProperty({
        required: true,
        example: faker.date.recent(),
    })
    signUpDate: Date;

    @ApiProperty({
        required: true,
        example: ENUM_USER_SIGN_UP_FROM.ADMIN,
        enum: ENUM_USER_SIGN_UP_FROM,
    })
    signUpFrom: ENUM_USER_SIGN_UP_FROM;

    @ApiHideProperty()
    @Exclude()
    salt: string;

    @ApiProperty({
        required: true,
        example: ENUM_USER_STATUS.ACTIVE,
        enum: ENUM_USER_STATUS,
    })
    status: ENUM_USER_STATUS;

    @ApiProperty({
        required: false,
    })
    photo?: string;

    @ApiProperty({
        example: ENUM_USER_GENDER.MALE,
        enum: ENUM_USER_GENDER,
        required: false,
    })
    gender?: ENUM_USER_GENDER;

    @ApiProperty({
        example: faker.string.uuid(),
        required: true,
    })
    country: string;

    @ApiProperty({
        example: faker.string.uuid(),
        required: false,
    })
    companyId?: string;
}
