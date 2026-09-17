import { PartialType } from '@nestjs/swagger';
import { RoleCreateRequestDto } from '@modules/role/dtos/request/role.create.request.dto';

export class RoleUpdateRequestDto extends PartialType(RoleCreateRequestDto) {}
