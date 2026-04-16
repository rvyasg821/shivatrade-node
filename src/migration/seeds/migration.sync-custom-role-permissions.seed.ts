import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_ROLE_TYPE } from '@modules/role/enums/role.enum';

/**
 * Syncs ALL roles (including custom company roles) with the latest module permissions.
 * New modules are added with `false` values; existing permissions are preserved.
 *
 * Run this whenever new modules are added to MODULES_PERMISSIONS.
 */
@Injectable()
export class MigrationSyncCustomRolePermissionsSeed {
    constructor(private readonly roleService: RoleService) {}

    @Command({
        command: 'sync:custom-role-permissions',
        describe: 'Sync all roles (including custom) with latest module permissions (adds missing modules with false defaults)',
    })
    async syncCustomRolePermissions(): Promise<void> {
        try {
            console.log('🔄 Syncing all roles with latest module permissions...');
            console.log('   New modules added with false defaults; existing values preserved.');
            console.log('');

            const allRoles = await this.roleService.findAll();
            const customRoles = allRoles.filter(r => r.type === ENUM_ROLE_TYPE.CUSTOM);
            const systemRoles = allRoles.filter(r => r.type === ENUM_ROLE_TYPE.SYSTEM);

            console.log(`   Found ${systemRoles.length} system roles + ${customRoles.length} custom roles`);
            console.log('');

            let updated = 0;
            for (const role of allRoles) {
                const before = JSON.stringify(role.permissions);
                role.permissions = this.roleService.syncPermissions(role.permissions);
                const after = JSON.stringify(role.permissions);

                if (before !== after) {
                    await this.roleService.saveEntity(role);
                    console.log(`   ✅ Synced: ${role.name} (${role.type}${role.companyId ? ' - company custom' : ''})`);
                    updated++;
                } else {
                    console.log(`   ⏭  No change: ${role.name}`);
                }
            }

            console.log('');
            if (updated === 0) {
                console.log('✅ All roles already up to date — no changes needed.');
            } else {
                console.log(`🎉 Done! ${updated} role(s) updated with latest module permissions.`);
            }
        } catch (err: any) {
            console.log('❌ Sync error:', err);
            throw new Error(err);
        }

        return;
    }
}
