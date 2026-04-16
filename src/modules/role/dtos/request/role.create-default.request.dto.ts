import { ApiProperty } from '@nestjs/swagger';
import { faker } from '@faker-js/faker';
import {
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
    IsObject,
    IsArray,
} from 'class-validator';
import { ENUM_ROLE_TYPE } from '@modules/role/enums/role.enum';

export class RoleCreateDefaultRequestDto {
    @ApiProperty({
        description: 'Name of role',
        example: faker.person.jobTitle(),
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(3)
    @MaxLength(50)
    name: string;

    @ApiProperty({
        description: 'Description of role',
        example: faker.lorem.sentence(),
        required: false,
        maxLength: 500,
    })
    @IsString()
    @IsOptional()
    @MaxLength(500)
    description?: string;

    @ApiProperty({
        description: 'Representative for role type',
        example: ENUM_ROLE_TYPE.SYSTEM,
        required: true,
        enum: ENUM_ROLE_TYPE,
    })
    @IsNotEmpty()
    @IsEnum(ENUM_ROLE_TYPE)
    type: ENUM_ROLE_TYPE;

    @ApiProperty({
        example: false,
        required: false,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isDefault?: boolean;

    @ApiProperty({
        required: false,
        description: 'Permission object with modules and their permissions',
        type: Object,
        example: {
            user: {
                can_all: false,
                can_read: true,
                can_add: false,
                can_update: false,
                can_delete: false
            }
        }
    })
    @IsOptional()
    @IsObject()
    permissions?: Record<string, Record<string, boolean>>;

    @ApiProperty({
        required: false,
        description: 'Role names that this role can assign to other users',
        type: [String],
        example: ['Location Admin', 'Employee']
    })
    @IsOptional()
    @IsArray()
    manageable_roles?: string[];

    @ApiProperty({
        required: false,
        description: 'Role names whose permissions this role can edit',
        type: [String],
        example: ['Location Admin', 'Employee']
    })
    @IsOptional()
    @IsArray()
    editable_roles?: string[];

    @ApiProperty({
        required: false,
        description: 'Scope of access for this role',
        enum: ['system', 'company', 'location', 'self'],
        example: 'company'
    })
    @IsOptional()
    @IsString()
    access_scope?: string;

    @ApiProperty({
        required: false,
        description: 'Category for role visibility',
        enum: ['admin', 'company_default', 'custom'],
        example: 'custom'
    })
    @IsOptional()
    @IsString()
    category?: string;
}
