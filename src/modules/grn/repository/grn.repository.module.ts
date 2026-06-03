import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { GrnEntity } from './entities/grn.entity';
import { GrnLineEntity } from './entities/grn-line.entity';
import { GrnRepository } from './repositories/grn.repository';
import { GrnLineRepository } from './repositories/grn-line.repository';

@Module({
    providers: [GrnRepository, GrnLineRepository],
    exports: [GrnRepository, GrnLineRepository],
    imports: [
        TypeOrmModule.forFeature(
            [GrnEntity, GrnLineEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class GrnRepositoryModule {}
