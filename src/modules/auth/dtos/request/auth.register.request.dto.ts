import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    MaxLength,
    MinLength,
    IsOptional,
    ValidateIf,
    minLength,
    IsEmail,
    IsUrl,
    Matches,
} from 'class-validator';
import { IsCustomEmail } from '@common/request/validations/request.custom-email.validation';
import { Transform } from 'class-transformer';

export class AuthRegisterRequestDto {
    @ApiProperty({
        description: 'Company name',
        example: faker.company.name(),
        required: true,
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    company_name: string;

    @ApiProperty({
        description: 'First name',
        example: faker.person.firstName(),
        required: true,
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    @Transform(({ value }) => value?.trim())
    fname: string;

    @ApiProperty({
        description: 'Last name',
        example: faker.person.lastName(),
        required: true,
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    @Transform(({ value }) => value?.trim())
    lname: string;

    @ApiProperty({
        description: 'Email address',
        example: faker.internet.email(),
        required: true,
        maxLength: 100,
    })
    @IsEmail()
    @IsNotEmpty()
    @MaxLength(100)
    @Transform(({ value }) => {
        if (!value) return value;
        // Handle URL-encoded + sign (appears as space after decoding)
        // Also handle %2B which is the URL-encoded form of +
        let email = value.toString();
        // Replace %2B with + (in case it wasn't auto-decoded)
        email = email.replace(/%2B/gi, '+');
        // Trim and lowercase
        return email.toLowerCase().trim();
    })
    email: string;

    @ApiProperty({
        description: 'Mobile number (optional)',
        example: faker.phone.number(),
        required: false,
        minLength: 8,
        maxLength: 20,
    })
    @IsOptional()
    @IsString()
    @MinLength(8)
    @MaxLength(20)
    @Matches(/^[0-9+\-\s()]+$/, {
        message: 'Mobile number can only contain numbers, spaces, and the characters: + - ( )',
    })
    @Transform(({ value }) => (value === "" || value === null || value === undefined ? undefined : value?.trim()))
    mobile?: string;

    @ApiProperty({
        description: 'Country code',
        example: {
            code: '+1',
            name: 'United States',
            format: "+.. .....-....."
        },
        required: true,
    })
    @IsNotEmpty()
    country_code: object;

    @ApiProperty({
        description: 'Password - Must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&-)',
        example: `${faker.string.alphanumeric(5).toLowerCase()}${faker.string.alphanumeric(5).toUpperCase()}@@!123`,
        required: true,
        minLength: 8,
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    @MaxLength(50)
    @Matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&-])[A-Za-z\d@$!%*?&-]/,
        {
            message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&-)',
        }
    )
    password: string;

    @ApiProperty({
        description: 'Website (optional)',
        example: faker.internet.url(),
        required: false,
    })
    @Transform(({ value }) => (value === "" || value === null ? undefined : value?.trim()))
    @IsOptional()
    @IsUrl({}, { message: 'Website must be a valid URL' })
    @MaxLength(200)
    website?: string;

    @ApiProperty({
        description: 'License number (optional)',
        example: 'LIC-123456789',
        required: false,
    })
    @Transform(({ value }) => (value === "" || value === null ? undefined : value?.trim()))
    @IsOptional()
    @IsString()
    @MaxLength(50)
    license_number?: string;

    @ApiProperty({
        description: 'Tax/VAT number (optional)',
        example: 'TAX-987654321',
        required: false,
    })
    @Transform(({ value }) => (value === "" || value === null ? undefined : value?.trim()))
    @IsOptional()
    @IsString()
    @MaxLength(50)
    tax_number?: string;

    @ApiProperty({
        description: 'Selected country ISO code (required)',
        example: 'US',
        required: true,
        maxLength: 2,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(2)
    @Transform(({ value }) => value?.toUpperCase()?.trim())
    selected_country: string;

    @ApiProperty({
        description: 'Timezone (required)',
        example: 'America/New_York',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => value?.trim())
    timezone: string;

    @ApiProperty({
        description: 'Currency code (required)',
        example: 'USD',
        required: true,
        maxLength: 3,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(3)
    @Transform(({ value }) => value?.toUpperCase()?.trim())
    currency: string;

    @ApiProperty({
        example: faker.location.streetAddress(),
        required: false,
        description: 'Address line 1'
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(({ value }) => value?.trim())
    address_1?: string;
    
    @ApiProperty({
        example: faker.location.streetAddress(),
        required: false,
        description: 'Address line 2'
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(({ value }) => value?.trim())
    address_2?: string;
    
    @ApiProperty({
        example: faker.location.city(),
        required: false,
        description: 'City'
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    city?: string;
    
    @ApiProperty({
        example: faker.location.state(),
        required: false,
        description: 'State'
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    state?: string;
    
    @ApiProperty({
        example: faker.location.country(),
        required: false,
        description: 'Country'
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => value?.trim())
    country?: string;
    
    @ApiProperty({
        example: faker.location.zipCode(),
        required: false,
        description: 'Zipcode'
    })
    @Transform(({ value }) => (value === "" || value === null ? undefined : value?.trim()))
    @IsOptional()
    @IsString()
    @MaxLength(20)
    @Matches(/^[A-Za-z0-9\s\-]+$/, {
        message: 'Zipcode can only contain letters, numbers, spaces, and hyphens',
    })
    zipcode?: string;

    @ApiProperty({
        example: faker.string.alphanumeric(8).toUpperCase(),
        required: false,
        description: 'Agent\'s referal code'
    })
    @IsOptional()
    @IsString()
    @MinLength(8)
    @MaxLength(8)
    @Transform(({ value }) => value?.trim()?.toUpperCase())
    referal_code?: string;
}