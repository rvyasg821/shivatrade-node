import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { ToolsEntity } from '@modules/tools/repository/entities/tools.entity';
import { ToolsRepository } from '@modules/tools/repository/repositories/tools.repository';

@Module({
    providers: [ToolsRepository],
    exports: [ToolsRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [ToolsEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class ToolsRepositoryModule { }
