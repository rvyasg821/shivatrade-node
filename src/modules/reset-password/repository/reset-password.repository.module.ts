import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { ResetPasswordEntity } from '@modules/reset-password/repository/entities/reset-password.entity';
import { ResetPasswordRepository } from '@modules/reset-password/repository/repositories/reset-password.repository';

@Module({
    providers: [ResetPasswordRepository],
    exports: [ResetPasswordRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [ResetPasswordEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class ResetPasswordRepositoryModule {}
