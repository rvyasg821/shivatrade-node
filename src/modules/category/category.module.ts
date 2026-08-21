import { Module } from '@nestjs/common';
import { CategoryRepositoryModule } from './repository/category.repository.module';
import { CategoryService } from './services/category.service';
import { CategoryImportExportService } from './services/category.import-export.service';
import { CategoryAdminController } from './controllers/category.admin.controller';
import { DependencyCheckModule } from '@modules/dependency-check/dependency-check.module';

@Module({
    imports: [CategoryRepositoryModule, DependencyCheckModule],
    providers: [CategoryService, CategoryImportExportService],
    exports: [
        CategoryRepositoryModule,
        CategoryService,
        CategoryImportExportService,
    ],
    controllers: [CategoryAdminController],
})
export class CategoryModule {}
