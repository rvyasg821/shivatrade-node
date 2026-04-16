import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { PlanEntity } from '@modules/plan/repository/entities/plan.entity';
import { PlanRepository } from '@modules/plan/repository/repositories/plan.repository';

@Module({
    providers: [PlanRepository],
    exports: [PlanRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [PlanEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class PlanRepositoryModule { }
