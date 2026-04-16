import { ApiProperty } from '@nestjs/swagger';
import { faker } from '@faker-js/faker';
import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CompanyGetResponseDto {
    @ApiProperty({
        example: '507f1f77bcf86cd799439011',
        description: 'Company ID'
    })
    _id: string;

    @ApiProperty({
        example: '507f1f77bcf86cd799439012',
        description: 'User ID who owns this company'
    })
    user_id: string;

    @ApiProperty({
        example: 'Acme Corporation',
        description: 'Company name'
    })
    company_name: string;

    @ApiProperty({
        example: 'John Doe',
        description: 'Contact person name'
    })
    contact_name: string;

    @ApiProperty({
        example: 'John',
        required: false,
        description: 'Contact person first name'
    })
    contact_first_name?: string;

    @ApiProperty({ required: false, description: 'Contact person middle name' })
    contact_middle_name?: string;

    @ApiProperty({
        example: 'Doe',
        required: false,
        description: 'Contact person last name'
    })
    contact_last_name?: string;

    @ApiProperty({
        example: 'contact@acme.com',
        description: 'Company email address'
    })
    email: string;

    @ApiProperty({
        example: '+1234567890',
        required: false,
        description: 'Company mobile number'
    })
    mobile?: string;

    @ApiProperty({
        example: { code: '+1', name: 'United States' },
        required: false,
        description: 'Country code object'
    })
    country_code?: object;

    @ApiProperty({
        example: 'https://www.acme.com',
        required: false,
        description: 'Company website URL'
    })
    website?: string;

    @ApiProperty({
        example: 'LIC-123456789',
        required: false,
        description: 'Company license number'
    })
    license_number?: string;

    @ApiProperty({
        example: 'TAX-987654321',
        required: false,
        description: 'Company tax/VAT number'
    })
    tax_number?: string;

    @ApiProperty({ required: false, description: 'Company code' })
    company_code?: string;

    @ApiProperty({ required: false, description: 'PAYE reference number' })
    paye_reference?: string;

    @ApiProperty({ required: false, description: 'Pension provider name' })
    pension_provider?: string;

    @ApiProperty({ required: false, description: 'Does business hold a sponsor licence' })
    is_sponsor_licence?: boolean;

    @ApiProperty({
        example: 'US',
        required: false,
        description: 'Selected country ISO code'
    })
    selected_country?: string;

    @ApiProperty({
        example: 'America/New_York',
        required: false,
        description: 'Company timezone'
    })
    timezone?: string;

    @ApiProperty({
        example: 'USD',
        required: false,
        description: 'Company currency code'
    })
    currency?: string;

    @ApiProperty({
        example: 'acme-corporation-12345678',
        required: false,
        description: 'Tenant ID for multi-tenant database'
    })
    tenantId?: string;

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
        photo?: string;
    };
    
    @ApiProperty({
        example: faker.location.streetAddress(),
        required: false,
        description: 'Address line 1'
    })
    address_1?: string;
    
    @ApiProperty({
        example: faker.location.streetAddress(),
        required: false,
        description: 'Address line 2'
    })
    address_2?: string;
    
    @ApiProperty({
        example: faker.location.city(),
        required: false,
        description: 'City'
    })
    city?: string;
    
    @ApiProperty({
        example: faker.location.state(),
        required: false,
        description: 'State'
    })
    state?: string;
    
    @ApiProperty({
        example: faker.location.country(),
        required: false,
        description: 'Country'
    })
    country?: string;
    
    @ApiProperty({
        example: faker.location.zipCode(),
        required: false,
        description: 'Country'
    })
    zipcode?: string;

    @ApiProperty({
        example: '2024-01-01T00:00:00.000Z',
        description: 'Creation date'
    })
    createdAt: Date;

    @ApiProperty({
        example: '2024-01-01T00:00:00.000Z',
        description: 'Last update date'
    })
    updatedAt: Date;

    @ApiProperty({
        example: '2024-01-01T00:00:00.000Z',
        required: false,
        description: 'Deletion date (for soft deleted records)'
    })
    deletedAt?: Date;
}