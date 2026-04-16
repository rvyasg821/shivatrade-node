import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    ResetPasswordEntity,
} from '@modules/reset-password/repository/entities/reset-password.entity';

@Injectable()
export class ResetPasswordRepository extends DatabaseObjectIdRepositoryBase<
    ResetPasswordEntity
> {
    constructor(
        @InjectDatabaseModel(ResetPasswordEntity)
        private readonly resetPasswordRepository: Repository<ResetPasswordEntity>
    ) {
        super(resetPasswordRepository);
    }
}
