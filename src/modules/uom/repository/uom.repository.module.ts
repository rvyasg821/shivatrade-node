import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { UomEntity } from './entities/uom.entity';
import { UomRepository } from './repositories/uom.repository';

@Module({
    providers: [UomRepository],
    exports: [UomRepository],
    imports: [TypeOrmModule.forFeature([UomEntity], DATABASE_CONNECTION_NAME)],
})
export class UomRepositoryModule {}
