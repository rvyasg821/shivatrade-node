import { Module } from '@nestjs/common';
import { DocumentRepositoryModule } from './repository/document.repository.module';
import { DocumentCategoryService } from './services/document-category.service';
import { DocumentService } from './services/document.service';
import { DocumentFileService } from './services/document-file.service';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';

@Module({
    imports: [DocumentRepositoryModule, UserRepositoryModule],
    providers: [DocumentCategoryService, DocumentService, DocumentFileService],
    exports: [
        DocumentRepositoryModule,
        DocumentCategoryService,
        DocumentService,
        DocumentFileService,
    ],
})
export class DocumentModule {}
