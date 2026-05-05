import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { LeadEntity } from './entities/lead.entity';
import { LeadRepository } from './repositories/lead.repository';

@Module({
    providers: [LeadRepository],
    exports: [LeadRepository],
    imports: [
        TypeOrmModule.forFeature([LeadEntity], DATABASE_CONNECTION_NAME),
    ],
})
export class LeadRepositoryModule {}
