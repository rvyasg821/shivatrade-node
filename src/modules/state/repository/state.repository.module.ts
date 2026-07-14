import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { StateEntity } from './entities/state.entity';
import { StateRepository } from './repositories/state.repository';

@Module({
    providers: [StateRepository],
    exports: [StateRepository],
    imports: [TypeOrmModule.forFeature([StateEntity], DATABASE_CONNECTION_NAME)],
})
export class StateRepositoryModule {}
