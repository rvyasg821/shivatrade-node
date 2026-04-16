import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { UserEntity } from '@modules/user/repository/entities/user.entity';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import { RoleEntity } from '@modules/role/repository/entities/role.entity';

@Module({
    providers: [UserRepository],
    exports: [UserRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [UserEntity, RoleEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class UserRepositoryModule {}
