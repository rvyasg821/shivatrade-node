import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ShiftTemplateEntity } from '../entities/shift-template.entity';

@Injectable()
export class ShiftTemplateRepository extends DatabaseObjectIdRepositoryBase<ShiftTemplateEntity> {
    constructor(
        @InjectDatabaseModel(ShiftTemplateEntity)
        private readonly repo: Repository<ShiftTemplateEntity>
    ) {
        super(repo);
    }
}
