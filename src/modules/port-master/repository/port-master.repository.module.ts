import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { PortMasterEntity } from './entities/port-master.entity';
import { PortMasterRepository } from './repositories/port-master.repository';

@Module({
    providers: [PortMasterRepository],
    exports: [PortMasterRepository],
    imports: [
        TypeOrmModule.forFeature([PortMasterEntity], DATABASE_CONNECTION_NAME),
    ],
})
export class PortMasterRepositoryModule {}
