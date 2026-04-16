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
    IsUUID,
    IsEmail,
} from 'class-validator';
import { IsCustomEmail } from '@common/request/validations/request.custom-email.validation';

export class isUserExistsRequestDto {
    @ApiProperty({
        example: faker.internet.email(),
        required: true,
        maxLength: 100,
    })
    // @IsCustomEmail()
    @IsNotEmpty()
    @IsEmail()
    @MaxLength(100)
    email: string;

    @ApiProperty({
        description: 'Password of user',
        example: faker.string.alphanumeric(24).toLowerCase(),
        required: false
    })
    @IsOptional()
    @IsUUID()
    userId?: string;
}
