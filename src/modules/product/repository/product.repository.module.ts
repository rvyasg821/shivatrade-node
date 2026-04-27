import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { ProductEntity } from './entities/product.entity';
import { ProductRepository } from './repositories/product.repository';

@Module({
    providers: [ProductRepository],
    exports: [ProductRepository],
    imports: [
        TypeOrmModule.forFeature([ProductEntity], DATABASE_CONNECTION_NAME),
    ],
})
export class ProductRepositoryModule {}
