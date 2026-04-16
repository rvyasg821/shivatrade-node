import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { DocumentCategoryEntity } from '../entities/document-category.entity';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';

@Injectable()
export class DocumentCategoryRepository extends DatabaseObjectIdRepositoryBase<DocumentCategoryEntity> {
    constructor(
        @InjectDatabaseModel(DocumentCategoryEntity)
        private readonly categoryRepo: Repository<DocumentCategoryEntity>
    ) {
        super(categoryRepo);
    }
}
