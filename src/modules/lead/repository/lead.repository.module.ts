import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { LeadEntity } from './entities/lead.entity';
import { LeadActivityEntity } from './entities/lead-activity.entity';
import { LeadLineEntity } from './entities/lead-line.entity';
import { LeadRepository } from './repositories/lead.repository';
import { LeadActivityRepository } from './repositories/lead-activity.repository';
import { LeadLineRepository } from './repositories/lead-line.repository';

@Module({
    providers: [LeadRepository, LeadActivityRepository, LeadLineRepository],
    exports: [LeadRepository, LeadActivityRepository, LeadLineRepository],
    imports: [
        TypeOrmModule.forFeature(
            [LeadEntity, LeadActivityEntity, LeadLineEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class LeadRepositoryModule {}
