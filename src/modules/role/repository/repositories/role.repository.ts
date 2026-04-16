import { Injectable } from '@nestjs/common';
import { Repository, FindOptionsRelations } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    RoleEntity,
} from '@modules/role/repository/entities/role.entity';

@Injectable()
export class RoleRepository extends DatabaseObjectIdRepositoryBase<
    RoleEntity
> {
    readonly _joinActive: FindOptionsRelations<RoleEntity> = {};

    constructor(
        @InjectDatabaseModel(RoleEntity)
        private readonly roleRepository: Repository<RoleEntity>
    ) {
        super(roleRepository);
    }

    async isExistByName(name: string): Promise<RoleEntity> {
        return await this.roleRepository.findOne({ where: { name } });
    }

    // Direct SQL update for JSONB permissions — bypasses TypeORM entity change detection
    async updatePermissions(
        id: string,
        permissions: Record<string, Record<string, boolean>>
    ): Promise<void> {
        await this.roleRepository.update(
            { _id: id } as any,
            { permissions, updatedAt: new Date() } as any
        );
    }
}
