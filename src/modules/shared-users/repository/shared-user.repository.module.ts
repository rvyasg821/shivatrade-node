import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { SharedUserEntity } from '@modules/shared-users/repository/entities/shared-user.entity';
import { SharedUserRepository } from '@modules/shared-users/repository/repositories/shared-user.repository';

@Module({
    providers: [SharedUserRepository],
    exports: [SharedUserRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [SharedUserEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class SharedUserRepositoryModule {}
