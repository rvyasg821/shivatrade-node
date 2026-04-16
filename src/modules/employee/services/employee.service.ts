import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { EmployeeRepository } from '../repository/repositories/employee.repository';
import { EmployeeDoc } from '../repository/entities/employee.entity';
import { EmployeeCreateRequestDto } from '../dtos/request/employee.create.request.dto';
import { EmployeeUpdateRequestDto } from '../dtos/request/employee.update.request.dto';
import { EmployeeGetResponseDto } from '../dtos/response/employee.get.response.dto';
import { EmployeeListResponseDto } from '../dtos/response/employee.list.response.dto';
import {
    IDatabaseCreateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class EmployeeService {
    private readonly logger = new Logger(EmployeeService.name);

    constructor(
        private readonly employeeRepository: EmployeeRepository
    ) {}

    /**
     * Create a new employee
     */
    async create(
        companyId: string,
        locationId: string,
        data: EmployeeCreateRequestDto,
        createdBy: string,
        options?: IDatabaseCreateOptions
    ): Promise<EmployeeDoc> {
        // Check if employee code already exists
        const codeExists = await this.employeeRepository.isEmployeeCodeExists(
            companyId,
            data.employee_code
        );

        if (codeExists) {
            throw new BadRequestException(
                `Employee code '${data.employee_code}' already exists for this company`
            );
        }

        // Check if email already exists
        const emailExists = await this.employeeRepository.isEmailExists(
            companyId,
            data.email
        );

        if (emailExists) {
            throw new BadRequestException(
                `Email '${data.email}' is already registered for an employee in this company`
            );
        }

        // Create employee
        const employee = await this.employeeRepository.create(
            {
                ...data,
                company_id: companyId,
                location_id: locationId,
                created_by: createdBy,
                employee_code: data.employee_code.toUpperCase(),
                email: data.email.toLowerCase(),
            } as any,
            options
        );

        this.logger.log(`Employee created: ${employee._id} for company: ${companyId}`);
        return employee;
    }

    /**
     * Find all employees for a company
     */
    async findAll(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<EmployeeDoc[]> {
        return this.employeeRepository.findByCompanyId(companyId, options);
    }

    /**
     * Find employees by location
     */
    async findByLocation(
        locationId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<EmployeeDoc[]> {
        return this.employeeRepository.findByLocationId(locationId, options);
    }

    /**
     * Find active employees for a company
     */
    async findActiveEmployees(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<EmployeeDoc[]> {
        return this.employeeRepository.findActiveByCompanyId(companyId, options);
    }

    /**
     * Find employee by ID
     */
    async findOneById(
        employeeId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<EmployeeDoc> {
        const employee = await this.employeeRepository.findOneById(
            employeeId,
            options
        );

        if (!employee) {
            throw new NotFoundException('Employee not found');
        }

        return employee;
    }

    /**
     * Update employee
     */
    async update(
        employee: EmployeeDoc,
        data: EmployeeUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<EmployeeDoc> {
        // If employee code is being updated, check uniqueness
        if (data.employee_code && data.employee_code !== employee.employee_code) {
            const codeExists = await this.employeeRepository.isEmployeeCodeExists(
                employee.company_id.toString(),
                data.employee_code,
                employee._id.toString()
            );

            if (codeExists) {
                throw new BadRequestException(
                    `Employee code '${data.employee_code}' already exists for this company`
                );
            }

            data.employee_code = data.employee_code.toUpperCase();
        }

        // If email is being updated, check uniqueness
        if (data.email && data.email !== employee.email) {
            const emailExists = await this.employeeRepository.isEmailExists(
                employee.company_id.toString(),
                data.email,
                employee._id.toString()
            );

            if (emailExists) {
                throw new BadRequestException(
                    `Email '${data.email}' is already registered for an employee in this company`
                );
            }

            data.email = data.email.toLowerCase();
        }

        // Update employee
        Object.assign(employee, data);
        const updated = await this.employeeRepository.save(employee, options);

        this.logger.log(`Employee updated: ${employee._id}`);
        return updated;
    }

    /**
     * Soft delete employee
     */
    async softDelete(
        employee: EmployeeDoc,
        options?: IDatabaseSaveOptions
    ): Promise<EmployeeDoc> {
        employee.soft_delete = true;
        employee.is_active = false;
        employee.deleted_at = new Date();
        const updated = await this.employeeRepository.save(employee, options);

        this.logger.log(`Employee soft deleted: ${employee._id}`);
        return updated;
    }

    /**
     * Count employees for a company
     */
    async countByCompanyId(companyId: string): Promise<number> {
        return this.employeeRepository.countByCompanyId(companyId);
    }

    /**
     * Count active employees for a company
     */
    async countActiveByCompanyId(companyId: string): Promise<number> {
        return this.employeeRepository.countActiveByCompanyId(companyId);
    }

    /**
     * Map employee document to response DTO
     */
    mapGet(employee: EmployeeDoc): EmployeeGetResponseDto {
        return plainToInstance(EmployeeGetResponseDto, employee);
    }

    /**
     * Map multiple employee documents to list response DTOs
     */
    mapList(employees: EmployeeDoc[]): EmployeeListResponseDto[] {
        return employees.map((employee) =>
            plainToInstance(EmployeeListResponseDto, employee)
        );
    }
}
