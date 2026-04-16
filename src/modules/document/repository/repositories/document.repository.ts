import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { DocumentEntity } from '../entities/document.entity';

@Injectable()
export class DocumentRepository extends DatabaseObjectIdRepositoryBase<DocumentEntity> {
    constructor(
        @InjectDatabaseModel(DocumentEntity)
        private readonly documentRepo: Repository<DocumentEntity>
    ) {
        super(documentRepo);
    }
}
