import { Injectable, Logger } from '@nestjs/common';
import { SharedUserService } from '@modules/shared-users/services/shared-user.service';
import { UserService } from '@modules/user/services/user.service';
import { RoleService } from '@modules/role/services/role.service';
import { CompanyService } from '@modules/company/services/company.service';
import { ENUM_SHARED_USER_TYPE } from '@modules/shared-users/repository/entities/shared-user.entity';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';

@Injectable()
export class SharedUserSyncService {
    private readonly logger = new Logger(SharedUserSyncService.name);

    constructor(
        private readonly sharedUserService: SharedUserService,
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly companyService: CompanyService
    ) {}

    async syncUserToSharedUsers(
        email: string,
        passwordHash: string,
        roleId: string,
        tenantId?: string,
        originalUserId?: string
    ): Promise<void> {
        try {
            // Determine user type based on role
            const userRole = await this.roleService.findOneById(roleId);
            let userType: ENUM_SHARED_USER_TYPE;
            let finalTenantId: string | null = tenantId || null;

            if (userRole?.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
                userType = ENUM_SHARED_USER_TYPE.ADMIN;
                finalTenantId = null;
            } else if (userRole?.name === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
                userType = ENUM_SHARED_USER_TYPE.COMPANY_ADMIN;
                // For company admin, tenantId will be set later in the registration flow
                finalTenantId = tenantId || null;
            } else {
                // Default to tenant user for other roles
                userType = ENUM_SHARED_USER_TYPE.TENANT_USER;
                finalTenantId = tenantId || null;
            }

            // Create entry in sharedUsers table
            await this.sharedUserService.create({
                email: email.toLowerCase(),
                password: passwordHash,
                tenantId: finalTenantId,
                userType,
                originalUserId: originalUserId || null,
            });

            this.logger.log(
                `✅ Created shared user entry for ${email} with type ${userType}`
            );
        } catch (error) {
            this.logger.warn(
                `⚠️ Failed to create shared user entry for ${email}:`,
                error
            );
            // Don't throw error to avoid breaking the main user creation flow
        }
    }

    async updateSharedUserTenantId(
        email: string,
        tenantId: string
    ): Promise<void> {
        try {
            await this.sharedUserService.updateByEmail(email, { tenantId });
            this.logger.log(
                `✅ Updated shared user tenantId for ${email}: ${tenantId}`
            );
        } catch (error) {
            this.logger.warn(
                `⚠️ Failed to update shared user tenantId for ${email}:`,
                error
            );
        }
    }

    async syncTenantUserToSharedUsers(
        email: string,
        passwordHash: string,
        tenantId: string,
        originalUserId?: string
    ): Promise<void> {
        try {
            await this.sharedUserService.create({
                email: email.toLowerCase(),
                password: passwordHash,
                tenantId,
                originalUserId: originalUserId || null,
                userType: ENUM_SHARED_USER_TYPE.TENANT_USER,
            });

            this.logger.log(
                `✅ Created shared user entry for tenant user: ${email} in tenant: ${tenantId}`
            );
        } catch (error) {
            this.logger.warn(
                `⚠️ Failed to create shared user entry for tenant user ${email}:`,
                error
            );
        }
    }
}
