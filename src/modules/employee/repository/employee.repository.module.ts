import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { EmployeeEntity } from './entities/employee.entity';
import { EmployeeRepository } from './repositories/employee.repository';
import { EmployeeLocationAssignmentEntity } from './entities/employee-location-assignment.entity';
import { EmployeeLocationAssignmentRepository } from './repositories/employee-location-assignment.repository';

@Module({
    providers: [EmployeeRepository, EmployeeLocationAssignmentRepository],
    exports: [EmployeeRepository, EmployeeLocationAssignmentRepository],
    imports: [
        TypeOrmModule.forFeature(
            [EmployeeEntity, EmployeeLocationAssignmentEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class EmployeeRepositoryModule {}
