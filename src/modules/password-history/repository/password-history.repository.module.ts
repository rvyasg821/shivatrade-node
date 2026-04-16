import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { PasswordHistoryEntity } from '@modules/password-history/repository/entities/password-history.entity';
import { PasswordHistoryRepository } from '@modules/password-history/repository/repositories/password-history.repository';

@Module({
    providers: [PasswordHistoryRepository],
    exports: [PasswordHistoryRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [PasswordHistoryEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class PasswordHistoryRepositoryModule {}
