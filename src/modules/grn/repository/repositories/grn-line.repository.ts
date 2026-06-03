import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { GrnLineDoc, GrnLineEntity } from '../entities/grn-line.entity';

@Injectable()
export class GrnLineRepository extends DatabaseObjectIdRepositoryBase<GrnLineEntity> {
    constructor(
        @InjectDatabaseModel(GrnLineEntity)
        private readonly grnLineRepository: Repository<GrnLineEntity>
    ) {
        super(grnLineRepository);
    }

    async findByGrnId(grnId: string): Promise<GrnLineDoc[]> {
        return this._repository.find({
            where: { grn_id: grnId, soft_delete: false } as any,
            order: { seq: 'ASC' },
        });
    }

    async deleteByGrnId(grnId: string): Promise<void> {
        await this._repository.delete({ grn_id: grnId } as any);
    }
}
