import { Command } from 'nestjs-command';
import { Injectable, Logger } from '@nestjs/common';
import { RoleService } from '@modules/role/services/role.service';
import { UserService } from '@modules/user/services/user.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';

@Injectable()
export class MigrateRoleHierarchySimpleCommand {
    private readonly logger = new Logger(MigrateRoleHierarchySimpleCommand.name);

    constructor(
        private readonly roleService: RoleService,
        private readonly userService: UserService,
    ) {}

    @Command({
        command: 'migrate:role-hierarchy-simple',
        describe: 'Simple migration for global roles and users only',
    })
    async migrateSimple(): Promise<void> {
        this.logger.log('🚀 Starting simple role hierarchy migration...');

        try {
            // Step 1: Update global roles with proper levels
            await this.updateGlobalRoles();

            // Step 2: Update global users with roleLevel based on their roles
            await this.updateGlobalUsers();

            this.logger.log('✅ Simple role hierarchy migration completed successfully');
        } catch (error) {
            this.logger.error('❌ Simple role hierarchy migration failed:', error);
            throw error;
        }
    }

    /**
     * Update global roles with proper hierarchy levels
     */
    private async updateGlobalRoles(): Promise<void> {
        this.logger.log('📝 Updating global roles with hierarchy levels...');

        const roles = await this.roleService.findAll();
        
        for (const role of roles) {
            let level: number;

            // Set fixed levels for system roles
            if (role.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN) {
                level = 1; // SuperAdmin has highest authority
            } else if (role.name === ENUM_SYSTEM_ROLE.COMPANY_ADMIN) {
                level = 2; // CompanyAdmin is second level
            } else {
                // Custom roles start from level 3
                level = 3;
            }

            // Update role level if it's different from current
            if (role.level !== level) {
                // Update using the service method
                await this.roleService.updateRoleLevel(role._id.toString(), level);
                this.logger.log(`✅ Updated role "${role.name}" to level ${level}`);
            }
        }

        this.logger.log('📝 Global roles hierarchy levels updated');
    }

    /**
     * Update global users with roleLevel based on their assigned roles
     */
    private async updateGlobalUsers(): Promise<void> {
        this.logger.log('📝 Updating global users with roleLevel...');

        const users = await this.userService.findAllWithRoleAndCountry();
        
        for (const user of users) {
            if (user.role && typeof user.role === 'object' && 'level' in user.role) {
                const roleLevel = (user.role as any).level || 1;
                
                // Update user's roleLevel if it's different from role's level
                if (user.roleLevel !== roleLevel) {
                    await this.userService.updateUserRoleLevel(user._id.toString(), roleLevel);
                    this.logger.log(`✅ Updated user "${user.email}" roleLevel to ${roleLevel}`);
                }
            }
        }

        this.logger.log('📝 Global users roleLevel updated');
    }
}