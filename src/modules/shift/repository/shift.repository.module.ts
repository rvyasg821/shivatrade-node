import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { ShiftTemplateEntity } from './entities/shift-template.entity';
import { ShiftAssignmentEntity } from './entities/shift-assignment.entity';
import { ShiftSwapRequestEntity } from './entities/shift-swap-request.entity';
import { ShiftTemplateRepository } from './repositories/shift-template.repository';
import { ShiftAssignmentRepository } from './repositories/shift-assignment.repository';
import { ShiftSwapRequestRepository } from './repositories/shift-swap-request.repository';

@Module({
    providers: [ShiftTemplateRepository, ShiftAssignmentRepository, ShiftSwapRequestRepository],
    exports: [ShiftTemplateRepository, ShiftAssignmentRepository, ShiftSwapRequestRepository],
    imports: [
        TypeOrmModule.forFeature(
            [ShiftTemplateEntity, ShiftAssignmentEntity, ShiftSwapRequestEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class ShiftRepositoryModule {}
