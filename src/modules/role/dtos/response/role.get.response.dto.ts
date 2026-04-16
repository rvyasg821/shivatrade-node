import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import { DatabaseObjectIdDto } from '@common/database/dtos/database.object-id.dto';
import { ENUM_ROLE_TYPE } from '@modules/role/enums/role.enum';

export class RoleGetResponseDto extends DatabaseObjectIdDto {
    @ApiProperty({
        description: 'Name of role',
        example: faker.person.jobTitle(),
        required: true,
    })
    name: string;

    @ApiProperty({
        description: 'Description of role',
        example: faker.lorem.sentence(),
        required: false,
        maxLength: 500,
    })
    description?: string;

    @ApiProperty({
        description: 'Active flag of role',
        example: true,
        required: true,
    })
    isActive: boolean;

    @ApiProperty({
        description: 'Representative for role type',
        example: ENUM_ROLE_TYPE.SYSTEM,
        required: true,
        enum: ENUM_ROLE_TYPE,
    })
    type: ENUM_ROLE_TYPE;

    @ApiProperty({
        description: 'Company ID for custom roles',
        example: faker.string.uuid(),
        required: false,
    })
    companyId?: string;

    @ApiProperty({
        description: 'Default role flag',
        example: false,
        required: true,
    })
    isDefault: boolean;

    @ApiProperty({
        type: Object,
        required: true,
        description: 'Permission object with modules and their permissions',
        example: {
            user: {
                can_all: false,
                can_read: true,
                can_add: false,
                can_update: false,
                can_delete: false
            },
            role: {
                can_all: false,
                can_read: false,
                can_add: false,
                can_update: false,
                can_delete: false
            }
        }
    })
    permissions: Record<string, Record<string, boolean>>;
}
