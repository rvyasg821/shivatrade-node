import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { SessionEntity } from '@modules/session/repository/entities/session.entity';
import { SessionRepository } from '@modules/session/repository/repositories/session.repository';

@Module({
    providers: [SessionRepository],
    exports: [SessionRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [SessionEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class SessionRepositoryModule {}
