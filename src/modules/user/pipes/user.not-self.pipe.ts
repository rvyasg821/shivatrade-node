import {
    BadRequestException,
    Inject,
    Injectable,
    PipeTransform,
    Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { IRequestApp } from '@common/request/interfaces/request.interface';
import { ENUM_USER_STATUS_CODE_ERROR } from '@modules/user/enums/user.status-code.enum';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';

@Injectable({ scope: Scope.REQUEST })
export class UserNotSelfPipe implements PipeTransform {
    constructor(@Inject(REQUEST) protected readonly request: IRequestApp) { }

    async transform(value: string): Promise<string> {
        const { user } = this.request;
        if (
            user.user === value &&
            user.role !== ENUM_SYSTEM_ROLE.SUPER_ADMIN
        ) {
            throw new BadRequestException({
                statusCode: ENUM_USER_STATUS_CODE_ERROR.NOT_SELF,
                message: 'user.error.notSelf',
            });
        }

        return value;
    }
}
