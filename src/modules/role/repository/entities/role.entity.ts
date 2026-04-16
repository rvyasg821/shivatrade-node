import { DatabaseObjectIdEntityBase } from '@common/database/bases/database.object-id.entity';
import { Entity, Column, Index } from 'typeorm';
import { ENUM_ROLE_TYPE } from '@modules/role/enums/role.enum';
import { UserEntity } from '@modules/user/repository/entities/user.entity';
import { IRolePermissions } from '@modules/role/interfaces/role-permissions.interface';

export const RoleTableName = 'roles';

@Entity(RoleTableName)
export class RoleEntity extends DatabaseObjectIdEntityBase {
    @Index()
    @Column({ type: 'varchar', length: 50, nullable: false })
    name: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    description?: string;

    @Index()
    @Column({ type: 'varchar', nullable: false })
    type: ENUM_ROLE_TYPE;

    @Column({ type: 'uuid', nullable: true })
    companyId?: string;

    @Column({ type: 'boolean', default: false })
    isDefault: boolean;

    @Index()
    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @Column({ type: 'jsonb', default: {} })
    permissions: IRolePermissions;

    @Index()
    @Column({ type: 'int', default: 1 })
    level: number;

    @Column({ type: 'text', array: true, default: '{}' })
    manageable_roles?: string[];

    @Column({ type: 'text', array: true, default: '{}' })
    editable_roles?: string[];

    @Column({ type: 'varchar', nullable: true, default: 'self' })
    access_scope?: string;

    @Column({ type: 'varchar', nullable: true, default: 'custom' })
    category?: string;

    // Virtual field for populating company users
    companyUsers?: UserEntity[];
}

export type RoleDoc = RoleEntity;
