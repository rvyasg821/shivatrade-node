import { Module } from '@nestjs/common';
import { ProductRepositoryModule } from './repository/product.repository.module';
import { ProductService } from './services/product.service';
import { ProductAdminController } from './controllers/product.admin.controller';
import { CategoryModule } from '@modules/category/category.module';

@Module({
    imports: [ProductRepositoryModule, CategoryModule],
    providers: [ProductService],
    exports: [ProductRepositoryModule, ProductService],
    controllers: [ProductAdminController],
})
export class ProductModule {}
