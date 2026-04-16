import {
    RoleDoc,
    RoleEntity,
} from '@modules/role/repository/entities/role.entity';
import {
    UserDoc,
    UserEntity,
} from '@modules/user/repository/entities/user.entity';

export interface IUserEntity
    extends Omit<UserEntity, 'role'> {
    role: RoleEntity;
}

export interface IUserDoc
    extends Omit<UserDoc, 'role'> {
    role: RoleDoc;
}
