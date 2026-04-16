import { Injectable } from '@nestjs/common';
import { Repository, Not } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { EmployeeEntity } from '../entities/employee.entity';

@Injectable()
export class EmployeeRepository extends DatabaseObjectIdRepositoryBase<
    EmployeeEntity
> {
    constructor(
        @InjectDatabaseModel(EmployeeEntity)
        private readonly employeeRepository: Repository<EmployeeEntity>
    ) {
        super(employeeRepository);
    }

    /**
     * Find all employees for a company
     */
    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<EmployeeEntity[]> {
        return this.findAll(
            {
                company_id: companyId,
                soft_delete: false,
            },
            options
        );
    }

    /**
     * Find employees by location
     */
    async findByLocationId(
        locationId: string,
        options?: any
    ): Promise<EmployeeEntity[]> {
        return this.findAll(
            {
                location_id: locationId,
                soft_delete: false,
            },
            options
        );
    }

    /**
     * Find active employees for a company
     */
    async findActiveByCompanyId(
        companyId: string,
        options?: any
    ): Promise<EmployeeEntity[]> {
        return this.findAll(
            {
                company_id: companyId,
                is_active: true,
                soft_delete: false,
            },
            options
        );
    }

    /**
     * Count total employees for a company
     */
    async countByCompanyId(companyId: string): Promise<number> {
        return this.employeeRepository.count({
            where: {
                company_id: companyId,
                soft_delete: false,
            } as any,
        });
    }

    /**
     * Count active employees for a company
     */
    async countActiveByCompanyId(companyId: string): Promise<number> {
        return this.employeeRepository.count({
            where: {
                company_id: companyId,
                is_active: true,
                soft_delete: false,
            } as any,
        });
    }

    /**
     * Check if employee code exists for a company
     */
    async isEmployeeCodeExists(
        companyId: string,
        employeeCode: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            employee_code: employeeCode.toUpperCase(),
            soft_delete: false,
        };

        if (excludeId) {
            where._id = Not(excludeId);
        }

        const count = await this.employeeRepository.count({ where });
        return count > 0;
    }

    /**
     * Check if email exists for a company
     */
    async isEmailExists(
        companyId: string,
        email: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            email: email.toLowerCase(),
            soft_delete: false,
        };

        if (excludeId) {
            where._id = Not(excludeId);
        }

        const count = await this.employeeRepository.count({ where });
        return count > 0;
    }
}
