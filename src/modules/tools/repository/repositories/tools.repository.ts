import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ToolsEntity } from '@modules/tools/repository/entities/tools.entity';
import {
    IDatabaseFindAllOptions,
} from '@common/database/interfaces/database.interface';
import { ENUM_TOOLS_STATUS } from '@modules/tools/enums/tools.enum';

@Injectable()
export class ToolsRepository extends DatabaseObjectIdRepositoryBase<
    ToolsEntity
> {
    constructor(
        @InjectDatabaseModel(ToolsEntity)
        private readonly toolsRepository: Repository<ToolsEntity>
    ) {
        super(toolsRepository);
    }

    async findAllActive(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<ToolsEntity[]> {
        return this.findAll(
            {
                ...find,
                status: ENUM_TOOLS_STATUS.ACTIVE,
            },
            options
        );
    }

    async countByStatus(status: ENUM_TOOLS_STATUS): Promise<number> {
        return this.getTotal({ status });
    }
}
