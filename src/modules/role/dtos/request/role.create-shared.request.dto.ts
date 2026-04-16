import { ApiProperty } from '@nestjs/swagger';
import { faker } from '@faker-js/faker';
import {
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
    IsObject,
} from 'class-validator';

export class RoleCreateSharedRequestDto {
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