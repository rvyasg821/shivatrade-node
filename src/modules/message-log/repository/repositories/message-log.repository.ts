import { Injectable } from '@nestjs/common';
import { Repository, LessThan } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { MessageLogEntity } from '../entities/message-log.entity';

@Injectable()
export class MessageLogRepository extends DatabaseObjectIdRepositoryBase<MessageLogEntity> {
    constructor(
        @InjectDatabaseModel(MessageLogEntity)
        private readonly repo: Repository<MessageLogEntity>
    ) {
        super(repo);
    }

    /**
     * Hard-delete logs older than the cutoff date. Used by the retention cron.
     * Returns the number of rows removed.
     */
    async deleteOlderThan(cutoff: Date): Promise<number> {
        const result = await this.repo.delete({
            createdAt: LessThan(cutoff) as any,
        });
        return result.affected || 0;
    }
}
