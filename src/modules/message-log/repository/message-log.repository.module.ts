import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { MessageLogEntity } from './entities/message-log.entity';
import { MessageLogRepository } from './repositories/message-log.repository';

@Module({
    providers: [MessageLogRepository],
    exports: [MessageLogRepository],
    imports: [
        TypeOrmModule.forFeature([MessageLogEntity], DATABASE_CONNECTION_NAME),
    ],
})
export class MessageLogRepositoryModule {}
