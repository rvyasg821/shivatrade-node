import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { EmployeeLocationAssignmentEntity } from '../entities/employee-location-assignment.entity';

@Injectable()
export class EmployeeLocationAssignmentRepository extends DatabaseObjectIdRepositoryBase<
    EmployeeLocationAssignmentEntity
> {
    constructor(
        @InjectDatabaseModel(EmployeeLocationAssignmentEntity)
        private readonly assignmentRepository: Repository<EmployeeLocationAssignmentEntity>
    ) {
        super(assignmentRepository);
    }

    async findByEmployeeId(
        employeeId: string
    ): Promise<EmployeeLocationAssignmentEntity[]> {
        return this.findAll({
            employee_id: employeeId,
            deleted: false,
        });
    }

    async findActiveByEmployeeId(
        employeeId: string
    ): Promise<EmployeeLocationAssignmentEntity[]> {
        return this.findAll({
            employee_id: employeeId,
            is_active: true,
            deleted: false,
        });
    }

    async findByLocationId(
        locationId: string
    ): Promise<EmployeeLocationAssignmentEntity[]> {
        return this.findAll({
            location_id: locationId,
            is_active: true,
            deleted: false,
        });
    }

    async findByCompanyId(
        companyId: string
    ): Promise<EmployeeLocationAssignmentEntity[]> {
        return this.findAll({
            company_id: companyId,
            deleted: false,
        });
    }
}
