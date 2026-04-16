import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    MaxLength,
    MinLength,
    IsOptional,
    ValidateIf,
    IsUrl,
    IsEmail,
} from 'class-validator';
import { IsCustomEmail } from '@common/request/validations/request.custom-email.validation';
import { Transform } from 'class-transformer';
import { ENUM_COMPANY_STATUS } from '@modules/company/enums/company.enum';

export class CompanyCreateRequestDto {
    @ApiProperty({
        example: faker.company.name(),
        required: true,
        maxLength: 100,
        minLength: 1,
        description: 'Company name'
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    company_name: string;

    @ApiProperty({
        example: faker.person.fullName(),
        required: true,
        maxLength: 100,
        minLength: 1,
        description: 'Contact person name'
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    contact_name: string;

    @ApiProperty({
        example: faker.person.firstName(),
        required: false,
        maxLength: 50,
        description: 'Contact person first name'
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => value?.trim())
    contact_first_name?: string;

    @ApiProperty({
        example: faker.person.lastName(),
        required: false,
        maxLength: 50,
        description: 'Contact person last name'
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => value?.trim())
    contact_last_name?: string;

    @ApiProperty({
        example: faker.internet.email(),
        required: true,
        maxLength: 100,
        description: 'Company email address'
    })
    // @IsCustomEmail()
    @IsEmail()
    @IsNotEmpty()
    @MaxLength(100)
    @Transform(({ value }) => value?.trim()?.toLowerCase())
    email: string;

    @ApiProperty({
        example: faker.phone.number(),
        required: false,
        maxLength: 20,
        minLength: 8,
        description: 'Company mobile number'
    })
    @ValidateIf((o) => o.mobile !== "" && o.mobile !== null && o.mobile !== undefined)
    @IsOptional()
    @IsString()
    @MinLength(8)
    @MaxLength(20)
    @Transform(({ value }) => (value === "" ? undefined : value?.trim()))
    mobile?: string;

    @ApiProperty({
        example: { code: '+1', name: 'United States' },
        required: false,
        description: 'Country code object'
    })
    @IsOptional()
    country_code?: object;

    @ApiProperty({
        example: faker.internet.url(),
        required: false,
        description: 'Company website URL'
    })
    @ValidateIf((o) => o.website !== "" && o.website !== null && o.website !== undefined)
    @IsOptional()
    @IsUrl({}, { message: 'Website must be a valid URL' })
    @Transform(({ value }) => (value === "" ? undefined : value?.trim()))
    website?: string;
    
    @ApiProperty({
        example: faker.location.streetAddress(),
        required: false,
        description: 'Address line 1'
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    address_1?: string;
    
    @ApiProperty({
        example: faker.location.streetAddress(),
        required: false,
        description: 'Address line 2'
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    address_2?: string;
    
    @ApiProperty({
        example: faker.location.city(),
        required: false,
        description: 'City'
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    city?: string;
    
    @ApiProperty({
        example: faker.location.state(),
        required: false,
        description: 'State'
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    state?: string;
    
    @ApiProperty({
        example: faker.location.country(),
        required: false,
        description: 'Country'
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    country?: string;
    
    @ApiProperty({
        example: faker.location.zipCode(),
        required: false,
        description: 'Zipcode'
    })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value?.trim())
    zipcode?: string;

    @ApiProperty({
        enum: ENUM_COMPANY_STATUS,
        required: false,
        example: ENUM_COMPANY_STATUS.ACTIVE,
    })
    @IsOptional()
    status?: ENUM_COMPANY_STATUS;

    @IsOptional() @IsString() selected_country?: string;
    @IsOptional() @IsString() timezone?: string;
    @IsOptional() @IsString() currency?: string;
    @IsOptional() @IsString() license_number?: string;
    @IsOptional() @IsString() tax_number?: string;
    @IsOptional() @IsString() company_code?: string;
    @IsOptional() @IsString() paye_reference?: string;
    @IsOptional() @IsString() contact_middle_name?: string;
    @IsOptional() @IsString() pension_provider?: string;
    @IsOptional() is_sponsor_licence?: boolean;
    @IsOptional() @IsString() @Transform(({ value }) => (value === '' ? undefined : value))
    password?: string;
}