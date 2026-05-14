import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { LeadEntity } from './entities/lead.entity';
import { LeadActivityEntity } from './entities/lead-activity.entity';
import { LeadRepository } from './repositories/lead.repository';
import { LeadActivityRepository } from './repositories/lead-activity.repository';

@Module({
    providers: [LeadRepository, LeadActivityRepository],
    exports: [LeadRepository, LeadActivityRepository],
    imports: [
        TypeOrmModule.forFeature(
            [LeadEntity, LeadActivityEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class LeadRepositoryModule {}
