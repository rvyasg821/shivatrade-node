import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { ENUM_ROLE_STATUS_CODE_ERROR } from '@modules/role/enums/role.status-code.enum';
import { RoleDoc } from '@modules/role/repository/entities/role.entity';
import { RoleService } from '@modules/role/services/role.service';

@Injectable()
export class RoleParsePipe implements PipeTransform {
    constructor(private readonly roleService: RoleService) {}

    async transform(value: string): Promise<RoleDoc> {
        // A non-UUID value previously threw a raw, uncaught Postgres
        // "invalid input syntax for uuid" error -> unhandled 500 instead of
        // a clean 404 (found via a full-app test pass). Mirrors the
        // already-correct ToolsParsePipe.
        let role: RoleDoc | undefined;
        try {
            role = await this.roleService.findOneById(value);
        } catch {
            role = undefined;
        }
        if (!role) {
            throw new NotFoundException({
                statusCode: ENUM_ROLE_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'role.error.notFound',
            });
        }

        return role;
    }
}
