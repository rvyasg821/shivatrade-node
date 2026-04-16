import { OmitType, PartialType } from '@nestjs/swagger';
import { UserCreateRequestDto } from '@modules/user/dtos/request/user.create.request.dto';

export class UserUpdateRequestDto extends PartialType(UserCreateRequestDto) {} //OmitType(UserCreateRequestDto, [
    // 'email',
// ] as const)) {}
