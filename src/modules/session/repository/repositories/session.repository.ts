import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    SessionEntity,
} from '@modules/session/repository/entities/session.entity';

@Injectable()
export class SessionRepository extends DatabaseObjectIdRepositoryBase<
    SessionEntity
> {
    constructor(
        @InjectDatabaseModel(SessionEntity)
        private readonly sessionRepository: Repository<SessionEntity>
    ) {
        super(sessionRepository);
    }
}
