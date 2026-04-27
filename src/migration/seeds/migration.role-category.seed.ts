import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';

@Injectable()
export class MigrationRoleCategorySeed {
    constructor(private readonly roleService: RoleService) { }

    @Command({
        command: 'migrate:role-category',
        describe: 'Add category field to existing roles',
    })
    async addCategoryToRoles(): Promise<void> {
        try {
            console.log('🔄 Starting role category migration...');

            // Get all roles
            const allRoles = await this.roleService.findAll();

            for (const role of allRoles) {
                let category: string;

                // Determine category based on role name
                if (
                    role.name === ENUM_SYSTEM_ROLE.SUPER_ADMIN ||
                    role.name === ENUM_SYSTEM_ROLE.AGENT ||
                    role.name === ENUM_SYSTEM_ROLE.VENDOR ||
                    role.name === ENUM_SYSTEM_ROLE.CUSTOMER
                ) {
                    category = 'admin';
                } else if (
                    role.name === ENUM_SYSTEM_ROLE.COMPANY_ADMIN ||
                    role.name === ENUM_SYSTEM_ROLE.LOCATION_ADMIN ||
                    role.name === ENUM_SYSTEM_ROLE.EMPLOYEE
                ) {
                    category = 'company_default';
                } else {
                    // Custom roles
                    category = 'custom';
                }

                // Update role category using updateRaw
                await this.roleService.updateRaw(
                    { _id: role._id.toString() },
                    { category }
                );

                console.log(`✅ Updated role: ${role.name} → category: ${category}`);
            }

            console.log('✅ Role category migration completed successfully');
        } catch (err: any) {
            console.error('❌ Role category migration failed:', err);
            throw new Error(err);
        }
    }
}
