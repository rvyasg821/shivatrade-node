import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ShiftSwapRequestEntity } from '../entities/shift-swap-request.entity';

@Injectable()
export class ShiftSwapRequestRepository extends DatabaseObjectIdRepositoryBase<ShiftSwapRequestEntity> {
    constructor(
        @InjectDatabaseModel(ShiftSwapRequestEntity)
        private readonly repo: Repository<ShiftSwapRequestEntity>
    ) {
        super(repo);
    }
}
