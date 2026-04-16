import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    MaxLength,
    MinLength,
    IsEnum,
    IsOptional,
    ValidateIf,
    IsNumber,
    IsEmail,
} from 'class-validator';
import { IsCustomEmail } from '@common/request/validations/request.custom-email.validation';
import { ENUM_USER_GENDER, ENUM_USER_STATUS } from '@modules/user/enums/user.enum';
import { IsPassword } from '@common/request/validations/request.is-password.validation';
import { Transform } from 'class-transformer';

export class UserAgentCreateRequestDto {
    @ApiProperty({
        example: faker.internet.email(),
        required: true,
        maxLength: 100,
    })
    // @IsCustomEmail()
    @IsEmail()
    @IsNotEmpty()
    @MaxLength(100)
    email: string;

    @ApiProperty({
        description: 'Password of user',
        example: `${faker.string.alphanumeric(5).toLowerCase()}${faker.string.alphanumeric(5).toUpperCase()}@@!123`,
        required: true,
        minLength: 8,
        maxLength: 50,
    })
    @IsOptional()
    @IsString()
    @IsPassword()
    @MinLength(8)
    @MaxLength(50)
    password?: string;

    @ApiProperty({
        example: faker.person.fullName(),
        required: false,
        maxLength: 100,
        minLength: 1,
    })
    @IsString()
    @IsNotEmpty()
    @IsOptional()
    @MaxLength(100)
    name?: string;

    @ApiProperty({
        example: faker.person.firstName(),
        required: false,
        maxLength: 50,
        description: 'User first name'
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => value?.trim())
    first_name?: string;

    @ApiProperty({
        example: faker.person.lastName(),
        required: false,
        maxLength: 50,
        description: 'User last name'
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => value?.trim())
    last_name?: string;

    @ApiProperty({ description: 'User country code' })
    @IsOptional()
    country_code?: object;

    @ApiProperty({ description: 'User mobile number' })
    @IsOptional()
    @IsString()
    @MinLength(0)
    @MaxLength(20)
    mobile?: string;

    @ApiProperty({
        required: true,
        enum: ENUM_USER_GENDER,
        example: ENUM_USER_GENDER.MALE,
    })
    @IsString()
    @IsEnum(ENUM_USER_GENDER)
    @IsNotEmpty()
    gender: ENUM_USER_GENDER;

    @ApiProperty({
        enum: ENUM_USER_STATUS,
        example: ENUM_USER_STATUS.ACTIVE,
    })
    @IsOptional()
    status?: ENUM_USER_STATUS;

    @ApiProperty({
        required: false,
        description: 'company id',
        example: faker.database.mongodbObjectId(),
    })
    @IsString()
    @IsOptional()
    companyId?: string | null;

    @ApiProperty({
        description: 'Company name',
        example: faker.company.name(),
        required: false,
    })
    @IsString()
    @IsOptional()
    company_name?: string;

    @ApiProperty({
        description: 'First name',
        example: faker.person.firstName(),
        required: false,
    })
    @IsString()
    @IsOptional()
    fname?: string;

    @ApiProperty({
        description: 'Last name',
        example: faker.person.lastName(),
        required: true,
        maxLength: 50,
    })
    @IsString()
    @IsOptional()
    lname?: string;


    @ApiProperty({
        description: 'Refereal Code for the Agent',
        example: 3,
        required: false
    })
    @IsString()
    @IsOptional()
    referal_code?: string;

    @ApiProperty({
        description: 'Commission of the Agent in percentage',
        example: 3,
        required: false
    })
    @IsNumber()
    @IsOptional()
    commission?: number;

    @ApiProperty({
        description: 'Photo of the Agent',
        example: faker.image.urlLoremFlickr({ category: 'people' }),
        required: false,
    })
    @IsString()
    @IsOptional()
    photo?: string;
}
