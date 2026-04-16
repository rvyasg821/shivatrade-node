import { Injectable, Logger, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { EmployeeRepository } from '../repository/repositories/employee.repository';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import { UserService } from '@modules/user/services/user.service';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';

@Injectable()
export class EmployeeValidationService {
    private readonly logger = new Logger(EmployeeValidationService.name);

    constructor(
        private readonly employeeRepository: EmployeeRepository,
        @Inject(forwardRef(() => SubscriptionService))
        private readonly subscriptionService: SubscriptionService,
        @Inject(forwardRef(() => UserService))
        private readonly userService: UserService,
        @Inject(forwardRef(() => RoleService))
        private readonly roleService: RoleService
    ) {}

    /**
     * Validate if company can create a new employee based on subscription
     */
    async validateEmployeeCreation(companyId: string, locationId: string): Promise<void> {
        // Get active subscription
        const subscription = await this.subscriptionService.findOne({
            company_id: companyId,
            status: true,
            soft_delete: false,
        });

        if (!subscription) {
            throw new BadRequestException(
                'No active subscription found. Please purchase a subscription to create employees.'
            );
        }

        // Get Employee role
        const employeeRole = await this.roleService.findOne({
            name: ENUM_SYSTEM_ROLE.EMPLOYEE,
        });

        if (!employeeRole) {
            throw new BadRequestException('Employee role not found');
        }

        // Count current employees (users with Employee role) from users table
        const currentEmployeeCount = await this.userService.getTotal({
            companyId: companyId,
            role: employeeRole._id,
        });

        // Check against subscription limit
        const allowedEmployees = subscription.users || 0;

        if (currentEmployeeCount >= allowedEmployees) {
            throw new BadRequestException(
                `Employee limit reached. Your plan allows ${allowedEmployees} employee(s). ` +
                `You currently have ${currentEmployeeCount} employee(s). ` +
                `Please upgrade your subscription to add more employees.`
            );
        }

        this.logger.log(
            `Employee validation passed for company: ${companyId}. ` +
            `Current: ${currentEmployeeCount}, Allowed: ${allowedEmployees}`
        );
    }

    /**
     * Get employee capacity info for a company
     */
    async getEmployeeCapacity(companyId: string): Promise<{
        current: number;
        allowed: number;
        remaining: number;
        canCreateMore: boolean;
    }> {
        const subscription = await this.subscriptionService.findOne({
            company_id: companyId,
            status: true,
            soft_delete: false,
        });

        const allowed = subscription?.users || 0;

        // Get Employee role
        const employeeRole = await this.roleService.findOne({
            name: ENUM_SYSTEM_ROLE.EMPLOYEE,
        });

        // Count employees from users table
        const current = employeeRole
            ? await this.userService.getTotal({
                companyId: companyId,
                role: employeeRole._id,
            })
            : 0;

        const remaining = Math.max(0, allowed - current);
        const canCreateMore = remaining > 0;

        return {
            current,
            allowed,
            remaining,
            canCreateMore,
        };
    }
}
