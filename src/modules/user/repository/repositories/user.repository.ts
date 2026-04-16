import { Injectable } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { RoleEntity } from '@modules/role/repository/entities/role.entity';
import {
    UserDoc,
    UserEntity,
} from '@modules/user/repository/entities/user.entity';
import { ENUM_USER_STATUS } from '@modules/user/enums/user.enum';
import { IDatabaseFindOneOptions } from '@common/database/interfaces/database.interface';

@Injectable()
export class UserRepository extends DatabaseObjectIdRepositoryBase<
    UserEntity
> {
    constructor(
        @InjectDatabaseModel(UserEntity)
        private readonly userRepository: Repository<UserEntity>,
        @InjectDatabaseModel(RoleEntity)
        private readonly roleRepository: Repository<RoleEntity>
    ) {
        super(userRepository);
    }

    async hardDelete(_id: string): Promise<boolean> {
        const result = await this._repository.delete({ _id } as any);
        return (result.affected || 0) > 0;
    }

    async isExistsByReferalCode(referralCode: string): Promise<boolean> {
        const result = await this._repository.findOne({
            where: {
                referal_code: referralCode?.toUpperCase(),
                status: ENUM_USER_STATUS.ACTIVE,
            } as any,
        });
        return !!result;
    }

    async findOneByReferalCode(referalCode: string): Promise<UserDoc> {
        return this._repository.findOne({
            where: {
                referal_code: referalCode?.toUpperCase(),
                status: ENUM_USER_STATUS.ACTIVE,
            } as any,
        });
    }

    async findOneByEmailWithPassword(email: string): Promise<UserDoc> {
        return this._repository.findOne({
            where: { email, deleted: false } as any,
            select: {
                _id: true,
                email: true,
                password: true,
                salt: true,
                name: true,
                first_name: true,
                last_name: true,
                role: true,
                status: true,
                companyId: true,
                location_id: true,
                deleted: true,
            } as any,
        });
    }

    async findOneByIdWithPassword(_id: string): Promise<UserDoc> {
        return this._repository.findOne({
            where: { _id } as any,
            select: {
                _id: true,
                email: true,
                password: true,
                salt: true,
                name: true,
                first_name: true,
                last_name: true,
                role: true,
                status: true,
                companyId: true,
                location_id: true,
            } as any,
        });
    }

    async findOneUserById(_id: string): Promise<UserDoc> {
        return this._repository.findOne({
            where: { _id } as any,
        });
    }

    /**
     * Override findOneById to populate role when join: true is requested.
     * (role is stored as a plain UUID column, not a TypeORM relation)
     */
    async findOneById<T = UserDoc>(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        const user = await super.findOneById<UserEntity>(_id, options);
        if (!user) return null as T;

        if (options?.join && user.role && typeof user.role === 'string') {
            const role = await this.roleRepository.findOne({
                where: { _id: user.role } as any,
            });
            if (role) (user as any).role = role;
        }

        return user as unknown as T;
    }

    /**
     * Override findOne to populate role when join: true is requested.
     */
    async findOne<T = UserDoc>(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<T> {
        const user = await super.findOne<UserEntity>(find, options);
        if (!user) return null as T;

        if (options?.join && user.role && typeof user.role === 'string') {
            const role = await this.roleRepository.findOne({
                where: { _id: user.role } as any,
            });
            if (role) (user as any).role = role;
        }

        return user as unknown as T;
    }

    /**
     * Override findAll to populate role when join: true is requested.
     * role is a plain UUID string column, not a TypeORM relation, so we batch-fetch roles manually.
     */
    async findAll<T = UserDoc>(
        find?: Record<string, any>,
        options?: any
    ): Promise<T[]> {
        const users = await super.findAll<UserEntity>(find, options);
        if (!users.length || !options?.join) return users as unknown as T[];

        // Collect unique role IDs
        const roleIds = [...new Set(
            users.map(u => u.role).filter(r => r && typeof r === 'string')
        )] as string[];

        if (!roleIds.length) return users as unknown as T[];

        // Batch-fetch all roles in one query
        const roles = await this.roleRepository.find({ where: { _id: In(roleIds) } as any });
        const roleMap = new Map(roles.map(r => [r._id.toString(), r]));

        // Attach role object to each user
        for (const user of users) {
            if (user.role && typeof user.role === 'string') {
                const role = roleMap.get(user.role);
                if (role) (user as any).role = role;
            }
        }

        return users as unknown as T[];
    }

    /**
     * Legacy join method - kept for backward compatibility
     */
    async join<T>(entity: UserEntity, _joins: Record<string, any>): Promise<T> {
        if (!entity) {
            throw new Error('Entity must be provided');
        }

        // Re-fetch the full user
        const user: any = await this._repository.findOne({
            where: { _id: (entity as any)._id } as any,
        });

        if (!user) return null;

        // Manually populate role if it's a UUID string
        if (user.role && typeof user.role === 'string') {
            const role = await this.roleRepository.findOne({
                where: { _id: user.role } as any,
            });
            if (role) {
                user.role = role;
            }
        }

        return user as unknown as T;
    }
}
