import { ApiProperty } from '@nestjs/swagger';
import { faker } from '@faker-js/faker';
import {
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
    IsObject,
} from 'class-validator';
import { ENUM_ROLE_TYPE } from '@modules/role/enums/role.enum';

export class RoleUpdateRequestDto {
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
        description: 'Company ID for custom roles',
        example: faker.string.uuid(),
        required: false,
    })
    @IsOptional()
    @IsString()
    companyId?: string;

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
}
