import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { DocumentCategoryEntity } from './entities/document-category.entity';
import { DocumentEntity } from './entities/document.entity';
import { DocumentCategoryRepository } from './repositories/document-category.repository';
import { DocumentRepository } from './repositories/document.repository';

@Module({
    providers: [DocumentCategoryRepository, DocumentRepository],
    exports: [DocumentCategoryRepository, DocumentRepository],
    imports: [
        TypeOrmModule.forFeature(
            [DocumentCategoryEntity, DocumentEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class DocumentRepositoryModule {}
