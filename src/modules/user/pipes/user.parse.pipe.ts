import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { ENUM_USER_STATUS_CODE_ERROR } from '@modules/user/enums/user.status-code.enum';
import { IUserDoc } from '@modules/user/interfaces/user.interface';
import { UserDoc } from '@modules/user/repository/entities/user.entity';
import { UserService } from '@modules/user/services/user.service';

const NOT_FOUND = {
    statusCode: ENUM_USER_STATUS_CODE_ERROR.NOT_FOUND,
    message: 'user.error.notFound',
};

@Injectable()
export class UserParsePipe implements PipeTransform {
    constructor(private readonly userService: UserService) {}

    async transform(value: string): Promise<UserDoc> {
        // A non-UUID value (e.g. "me", a typo'd id) previously threw a raw,
        // uncaught Postgres "invalid input syntax for uuid" error out of
        // findOneById() -> unhandled 500 instead of a clean 404 (found via a
        // full-app test pass). Wrapping mirrors the already-correct
        // ToolsParsePipe.
        let user: UserDoc | undefined;
        try {
            user = await this.userService.findOneById(value);
        } catch {
            throw new NotFoundException(NOT_FOUND);
        }
        if (!user) {
            throw new NotFoundException(NOT_FOUND);
        }

        return user;
    }
}

@Injectable()
export class UserActiveParsePipe implements PipeTransform {
    constructor(private readonly userService: UserService) {}

    async transform(value: string): Promise<IUserDoc> {
        let user: IUserDoc | undefined;
        try {
            user = await this.userService.findOneWithRoleAndCountryById(value);
        } catch {
            throw new NotFoundException(NOT_FOUND);
        }
        if (!user) {
            throw new NotFoundException(NOT_FOUND);
        }

        return user;
    }
}
