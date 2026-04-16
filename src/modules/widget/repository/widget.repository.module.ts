import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { WidgetEntity } from './entities/widget.entity';
import { WidgetRepository } from './repositories/widget.repository';

@Module({
    providers: [WidgetRepository],
    exports: [WidgetRepository],
    imports: [
        TypeOrmModule.forFeature(
            [WidgetEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class WidgetRepositoryModule {}
