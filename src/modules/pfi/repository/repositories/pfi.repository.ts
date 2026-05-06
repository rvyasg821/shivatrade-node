import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { PfiEntity } from '../entities/pfi.entity';

@Injectable()
export class PfiRepository extends DatabaseObjectIdRepositoryBase<PfiEntity> {
    constructor(
        @InjectDatabaseModel(PfiEntity)
        private readonly pfiRepository: Repository<PfiEntity>
    ) {
        super(pfiRepository);
    }
}
