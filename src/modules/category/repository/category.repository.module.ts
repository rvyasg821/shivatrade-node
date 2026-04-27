import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { CategoryEntity } from './entities/category.entity';
import { CategoryRepository } from './repositories/category.repository';

@Module({
    providers: [CategoryRepository],
    exports: [CategoryRepository],
    imports: [
        TypeOrmModule.forFeature(
            [CategoryEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class CategoryRepositoryModule {}
