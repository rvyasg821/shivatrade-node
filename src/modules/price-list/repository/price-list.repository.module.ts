import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { PriceListEntity } from './entities/price-list.entity';
import { PriceListRepository } from './repositories/price-list.repository';

@Module({
    providers: [PriceListRepository],
    exports: [PriceListRepository],
    imports: [
        TypeOrmModule.forFeature([PriceListEntity], DATABASE_CONNECTION_NAME),
    ],
})
export class PriceListRepositoryModule {}
