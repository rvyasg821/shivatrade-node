import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { ProductEntity } from './entities/product.entity';
import { ProductRebateEntity } from './entities/product-rebate.entity';
import { ProductExpenseEntity } from './entities/product-expense.entity';
import { ProductRepository } from './repositories/product.repository';
import { ProductRebateRepository } from './repositories/product-rebate.repository';
import { ProductExpenseRepository } from './repositories/product-expense.repository';

@Module({
    providers: [ProductRepository, ProductRebateRepository, ProductExpenseRepository],
    exports: [ProductRepository, ProductRebateRepository, ProductExpenseRepository],
    imports: [
        TypeOrmModule.forFeature(
            [ProductEntity, ProductRebateEntity, ProductExpenseEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class ProductRepositoryModule {}
