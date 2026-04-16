import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, MinLength, ValidateIf, IsOptional, IsEnum, IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ENUM_USER_GENDER } from '@modules/user/enums/user.enum';
import { IsCustomEmail } from '@common/request/validations/request.custom-email.validation';

export class AuthUpdateProfileRequestDto {
    @ApiProperty({
        example: faker.person.fullName(),
        required: false,
        maxLength: 100,
        minLength: 1,
    })
    @IsString()
    @IsOptional()
    @MinLength(1)
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

    @ApiProperty({
        example: faker.internet.email(),
        required: true,
        maxLength: 100,
    })
    // @IsCustomEmail()
    @IsEmail()
    @IsOptional()
    @IsString()
    @MaxLength(100)
    email?: string;

    @ApiProperty({ description: 'User country code' })
    @IsOptional()
    country_code?: object;

    @ApiProperty({
        example: `+91${faker.number.int({ min: 6000000000, max: 9999999999 })}`,
        description: 'User mobile number'
    })
    // @ValidateIf((o) => o.mobile !== '' && o.mobile !== null && o.mobile !== undefined)
    @IsOptional()
    @IsString()
    @MinLength(0)
    @MaxLength(20)
    // @Transform(({ value }) => (value === '' ? undefined : value))  // 👈 convert "" -> undefined
    mobile?: string;

    @ApiProperty({
        required: true,
        enum: ENUM_USER_GENDER,
        example: ENUM_USER_GENDER.MALE,
    })
    @IsString()
    @IsEnum(ENUM_USER_GENDER)
    @IsOptional()
    gender: ENUM_USER_GENDER;

    @ApiProperty({
        example: faker.image.dataUri(),
        required: false,
        description: 'User photo',
    })
    @IsOptional()
    @IsString()
    photo?: string;

    @ApiProperty({ required: false, description: 'Address line 1' })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    address_line1?: string;

    @ApiProperty({ required: false, description: 'Address line 2' })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    address_line2?: string;

    @ApiProperty({ required: false, description: 'City' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    city?: string;

    @ApiProperty({ required: false, description: 'State/Province' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    state?: string;

    @ApiProperty({ required: false, description: 'Postal code' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    postcode?: string;

    @ApiProperty({ required: false, description: 'Country' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    country?: string;

    // Extended employee self-service fields
    @IsOptional() @IsString() middle_name?: string;
    @IsOptional() @IsString() date_of_birth?: string;
    @IsOptional() @IsString() marital_status?: string;
    @IsOptional() @IsString() nationality?: string;
    @IsOptional() @IsString() home_telephone?: string;

    // Emergency contact
    @IsOptional() @IsString() kin_name?: string;
    @IsOptional() @IsString() kin_relationship?: string;
    @IsOptional() @IsString() kin_address?: string;
    @IsOptional() @IsString() kin_postcode?: string;
    @IsOptional() @IsString() kin_phone?: string;
    @IsOptional() @IsString() kin_email?: string;

    // Bank details
    @IsOptional() @IsString() bank_name?: string;
    @IsOptional() @IsString() account_holder_name?: string;
    @IsOptional() @IsString() sort_code?: string;
    @IsOptional() @IsString() account_number?: string;
}
