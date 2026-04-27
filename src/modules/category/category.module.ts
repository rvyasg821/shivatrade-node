import { Module } from '@nestjs/common';
import { CategoryRepositoryModule } from './repository/category.repository.module';
import { CategoryService } from './services/category.service';
import { CategoryAdminController } from './controllers/category.admin.controller';

@Module({
    imports: [CategoryRepositoryModule],
    providers: [CategoryService],
    exports: [CategoryRepositoryModule, CategoryService],
    controllers: [CategoryAdminController],
})
export class CategoryModule {}
