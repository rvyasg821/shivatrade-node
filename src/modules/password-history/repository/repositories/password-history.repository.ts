import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    PasswordHistoryEntity,
} from '@modules/password-history/repository/entities/password-history.entity';

@Injectable()
export class PasswordHistoryRepository extends DatabaseObjectIdRepositoryBase<
    PasswordHistoryEntity
> {
    constructor(
        @InjectDatabaseModel(PasswordHistoryEntity)
        private readonly passwordHistoryRepository: Repository<PasswordHistoryEntity>
    ) {
        super(passwordHistoryRepository);
    }
}
