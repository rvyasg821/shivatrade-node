import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { RoleEntity } from '@modules/role/repository/entities/role.entity';
import { RoleRepository } from '@modules/role/repository/repositories/role.repository';

@Module({
    providers: [RoleRepository],
    exports: [RoleRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [RoleEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class RoleRepositoryModule {}
