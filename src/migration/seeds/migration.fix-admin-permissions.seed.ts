import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';

@Injectable()
export class MigrationFixAdminPermissionsSeed {
    constructor(private readonly roleService: RoleService) { }

    @Command({
        command: 'fix:admin-permissions',
        describe: 'Remove location and employee permissions from Super Admin',
    })
    async fixAdminPermissions(): Promise<void> {
        try {
            console.log('🔄 Fixing Super Admin permissions...\n');

            // Find Super Admin role
            const adminRole = await this.roleService.findOne({
                name: ENUM_SYSTEM_ROLE.SUPER_ADMIN,
            });

            if (!adminRole) {
                console.error('❌ Super Admin role not found!');
                return;
            }

            console.log('📋 Current permissions:');
            console.log('  Location:', adminRole.permissions?.location || 'NOT FOUND');
            console.log('  Employee:', adminRole.permissions?.employee || 'NOT FOUND');
            console.log('');

            // Update permissions to remove/disable location and employee
            adminRole.permissions = adminRole.permissions || {};

            // Set location permissions to false
            adminRole.permissions.location = {
                can_all: false,
                can_read: false,
                can_add: false,
                can_update: false,
                can_delete: false,
            };

            // Set employee permissions to false
            adminRole.permissions.employee = {
                can_all: false,
                can_read: false,
                can_add: false,
                can_update: false,
                can_delete: false,
            };

            // Save the role using service
            await this.roleService.saveEntity(adminRole);

            console.log('✅ Super Admin permissions updated!');
            console.log('📋 New permissions:');
            console.log('  Location:', adminRole.permissions.location);
            console.log('  Employee:', adminRole.permissions.employee);
            console.log('');
            console.log('✅ Done! Now logout and login again to get fresh JWT token.');
            console.log('');
            console.log('⚠️  IMPORTANT NEXT STEPS:');
            console.log('   1. Open browser (F12) → Application → Clear site data');
            console.log('   2. Logout completely');
            console.log('   3. Close browser tab');
            console.log('   4. Open fresh tab and login again');
            console.log('   5. Locations menu should be GONE from left sidebar');
        } catch (err: any) {
            console.error('❌ Error:', err.message);
            throw new Error(err);
        }
    }
}
