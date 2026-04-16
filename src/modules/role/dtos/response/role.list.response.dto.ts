import { ApiHideProperty, ApiProperty, OmitType } from '@nestjs/swagger';
import { Exclude, Transform } from 'class-transformer';
import { RoleGetResponseDto } from '@modules/role/dtos/response/role.get.response.dto';

export class RoleListResponseDto extends OmitType(RoleGetResponseDto, [
    'permissions'
] as const) {
    @ApiProperty({
        description: 'permissions object with all modules and their settings',
        required: true,
        type: () => Object,
        example: {
            user: { can_read: true, can_add: false, can_update: true, can_delete: false },
            role: { can_read: true, can_add: true, can_update: true, can_delete: false }
        }
    })
    permissions: Record<string, Record<string, boolean>>;
}
