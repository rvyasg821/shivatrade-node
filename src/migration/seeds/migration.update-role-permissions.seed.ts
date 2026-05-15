import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { COMPANY_DEFAULT_PERMISSIONS } from '@modules/role/constants/company.permissions';
import { AGENT_DEFAULT_PERMISSIONS } from '@modules/role/constants/agent.permissions';
import { LOCATION_ADMIN_DEFAULT_PERMISSIONS } from '@modules/role/constants/location-admin.permissions';
import { EMPLOYEE_DEFAULT_PERMISSIONS } from '@modules/role/constants/employee.permissions';
import { VENDOR_DEFAULT_PERMISSIONS } from '@modules/role/constants/vendor.permissions';
import { CUSTOMER_DEFAULT_PERMISSIONS } from '@modules/role/constants/customer.permissions';

@Injectable()
export class MigrationUpdateRolePermissionsSeed {
    constructor(private readonly roleService: RoleService) { }

    @Command({
        command: 'update:role-permissions',
        describe: 'Update all system roles with latest permissions (including new HRM modules)',
    })
    async updateRolePermissions(): Promise<void> {
        try {
            console.log('🔄 Updating all system roles with latest permissions...');
            console.log('   (This adds HRM module permissions to existing roles)');
            console.log('');

            // ── Super Admin: all permissions true except location + employee ──
            const defaultPermissions = this.roleService.getDefaultPermissions();
            const adminPermissions = { ...defaultPermissions };
            Object.keys(adminPermissions).forEach(module => {
                if (module === 'location' || module === 'employee') return;
                Object.keys(adminPermissions[module]).forEach(perm => {
                    adminPermissions[module][perm] = true;
                });
            });

            const superAdminRole = await this.roleService.findOneByName(ENUM_SYSTEM_ROLE.SUPER_ADMIN);
            if (superAdminRole) {
                await this.roleService.findByIdAndUpdate(String(superAdminRole._id), adminPermissions);
                console.log('✅ Super Admin role updated');
            } else {
                console.log('⚠️  Super Admin role not found');
            }

            // ── Company Admin ──
            const companyAdminRole = await this.roleService.findOneByName(ENUM_SYSTEM_ROLE.COMPANY_ADMIN);
            if (companyAdminRole) {
                await this.roleService.findByIdAndUpdate(String(companyAdminRole._id), COMPANY_DEFAULT_PERMISSIONS);
                console.log('✅ Company Admin role updated');
            } else {
                console.log('⚠️  Company Admin role not found');
            }

            // ── Location Admin ──
            const locationAdminRole = await this.roleService.findOneByName(ENUM_SYSTEM_ROLE.LOCATION_ADMIN);
            if (locationAdminRole) {
                await this.roleService.findByIdAndUpdate(String(locationAdminRole._id), LOCATION_ADMIN_DEFAULT_PERMISSIONS);
                console.log('✅ Location Admin role updated');
            } else {
                console.log('⚠️  Location Admin role not found');
            }

            // ── Employee ──
            const employeeRole = await this.roleService.findOneByName(ENUM_SYSTEM_ROLE.EMPLOYEE);
            if (employeeRole) {
                await this.roleService.findByIdAndUpdate(String(employeeRole._id), EMPLOYEE_DEFAULT_PERMISSIONS);
                console.log('✅ Employee role updated');
            } else {
                console.log('⚠️  Employee role not found');
            }

            // ── Agent ──
            const agentRole = await this.roleService.findOneByName(ENUM_SYSTEM_ROLE.AGENT);
            if (agentRole) {
                await this.roleService.findByIdAndUpdate(String(agentRole._id), AGENT_DEFAULT_PERMISSIONS);
                console.log('✅ Agent role updated');
            } else {
                console.log('⚠️  Agent role not found');
            }

            // ── Vendor ──
            const vendorRole = await this.roleService.findOneByName(ENUM_SYSTEM_ROLE.VENDOR);
            if (vendorRole) {
                await this.roleService.findByIdAndUpdate(String(vendorRole._id), VENDOR_DEFAULT_PERMISSIONS);
                console.log('✅ Vendor role updated');
            } else {
                console.log('⚠️  Vendor role not found');
            }

            // ── Customer ──
            const customerRole = await this.roleService.findOneByName(ENUM_SYSTEM_ROLE.CUSTOMER);
            if (customerRole) {
                await this.roleService.findByIdAndUpdate(String(customerRole._id), CUSTOMER_DEFAULT_PERMISSIONS);
                console.log('✅ Customer role updated');
            } else {
                console.log('⚠️  Customer role not found');
            }

            console.log('');
            console.log('🎉 All role permissions updated successfully!');
            console.log('   HRM modules now accessible: holiday_calendar, document, contract,');
            console.log('   leave, attendance, shift, compliance');

        } catch (err: any) {
            console.log('❌ Role permission update error:', err);
            throw new Error(err);
        }

        return;
    }
}
