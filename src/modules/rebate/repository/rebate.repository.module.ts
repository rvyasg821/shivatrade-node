import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { RebateEntity } from './entities/rebate.entity';
import { RebateRepository } from './repositories/rebate.repository';

@Module({
    providers: [RebateRepository],
    exports: [RebateRepository],
    imports: [
        TypeOrmModule.forFeature([RebateEntity], DATABASE_CONNECTION_NAME),
    ],
})
export class RebateRepositoryModule {}
