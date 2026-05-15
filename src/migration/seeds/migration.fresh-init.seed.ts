import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { UserService } from '@modules/user/services/user.service';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_USER_GENDER, ENUM_USER_SIGN_UP_FROM } from '@modules/user/enums/user.enum';
import { PasswordHistoryService } from '@modules/password-history/services/password-history.service';
import { ActivityService } from '@modules/activity/services/activity.service';
import { ENUM_PASSWORD_HISTORY_TYPE } from '@modules/password-history/enums/password-history.enum';
import { SessionService } from '@modules/session/services/session.service';
import { ENUM_SYSTEM_ROLE, ENUM_ROLE_TYPE } from '@modules/role/enums/role.enum';
import { HelperHashService } from '@common/helper/services/helper.hash.service';
import { HelperDateService } from '@common/helper/services/helper.date.service';
import { RoleRepository } from '@modules/role/repository/repositories/role.repository';
import { RoleCreateDefaultRequestDto } from '@modules/role/dtos/request/role.create-default.request.dto';
import { COMPANY_DEFAULT_PERMISSIONS } from '@modules/role/constants/company.permissions';
import { AGENT_DEFAULT_PERMISSIONS } from '@modules/role/constants/agent.permissions';
import { LOCATION_ADMIN_DEFAULT_PERMISSIONS } from '@modules/role/constants/location-admin.permissions';
import { EMPLOYEE_DEFAULT_PERMISSIONS } from '@modules/role/constants/employee.permissions';
import { VENDOR_DEFAULT_PERMISSIONS } from '@modules/role/constants/vendor.permissions';
import { CUSTOMER_DEFAULT_PERMISSIONS } from '@modules/role/constants/customer.permissions';

@Injectable()
export class MigrationFreshInitSeed {
    constructor(
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly roleRepository: RoleRepository,
        private readonly passwordHistoryService: PasswordHistoryService,
        private readonly activityService: ActivityService,
        private readonly sessionService: SessionService,
        private readonly helperHashService: HelperHashService,
        private readonly helperDateService: HelperDateService,
    ) { }

    @Command({
        command: 'seed:fresh-init',
        describe: 'Delete all roles, users and create only super admin',
    })
    async seed(): Promise<void> {
        try {
            console.log('🗑️  Starting fresh initialization...');

            // Step 1: Delete all existing data
            console.log('🗑️  Deleting existing data...');

            await this.activityService.deleteMany();
            console.log('✅ Activities deleted');

            await this.passwordHistoryService.deleteMany();
            console.log('✅ Password history deleted');

            await this.sessionService.resetLoginSession();
            await this.sessionService.deleteMany();
            console.log('✅ Sessions deleted');

            await this.userService.deleteMany();
            console.log('✅ Users deleted');

            // Delete all roles
            await this.roleService.deleteMany();
            console.log('✅ Roles deleted');

            // Step 2: Create All System Roles with Permissions
            console.log('\n📝 Creating system roles with permissions...');

            // Get default permissions template
            const defaultPermissions = this.roleService.getDefaultPermissions();

            // Create admin permissions with all modules enabled except location and employee
            const adminPermissions = { ...defaultPermissions };
            Object.keys(adminPermissions).forEach(module => {
                // Skip location and employee modules for Super Admin
                if (module === 'location' || module === 'employee') {
                    return;
                }
                Object.keys(adminPermissions[module]).forEach(permission => {
                    adminPermissions[module][permission] = true;
                });
            });

            const roleData: RoleCreateDefaultRequestDto[] = [
                {
                    name: ENUM_SYSTEM_ROLE.SUPER_ADMIN,
                    type: ENUM_ROLE_TYPE.SYSTEM,
                    isDefault: true,
                    permissions: adminPermissions,
                    manageable_roles: [
                        ENUM_SYSTEM_ROLE.COMPANY_ADMIN,
                        ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
                        ENUM_SYSTEM_ROLE.EMPLOYEE,
                        ENUM_SYSTEM_ROLE.AGENT
                    ],
                    editable_roles: [
                        ENUM_SYSTEM_ROLE.COMPANY_ADMIN,
                        ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
                        ENUM_SYSTEM_ROLE.EMPLOYEE,
                        ENUM_SYSTEM_ROLE.AGENT
                    ],
                    access_scope: 'system',
                    category: 'admin',
                },
                {
                    name: ENUM_SYSTEM_ROLE.COMPANY_ADMIN,
                    type: ENUM_ROLE_TYPE.SYSTEM,
                    isDefault: true,
                    permissions: COMPANY_DEFAULT_PERMISSIONS,
                    manageable_roles: [
                        ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
                        ENUM_SYSTEM_ROLE.EMPLOYEE
                    ],
                    editable_roles: [
                        ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
                        ENUM_SYSTEM_ROLE.EMPLOYEE
                    ],
                    access_scope: 'company',
                    category: 'company_default',
                },
                {
                    name: ENUM_SYSTEM_ROLE.LOCATION_ADMIN,
                    type: ENUM_ROLE_TYPE.SYSTEM,
                    isDefault: true,
                    permissions: LOCATION_ADMIN_DEFAULT_PERMISSIONS,
                    manageable_roles: [
                        ENUM_SYSTEM_ROLE.EMPLOYEE
                    ],
                    editable_roles: [],
                    access_scope: 'location',
                    category: 'company_default',
                },
                {
                    name: ENUM_SYSTEM_ROLE.EMPLOYEE,
                    type: ENUM_ROLE_TYPE.SYSTEM,
                    isDefault: true,
                    permissions: EMPLOYEE_DEFAULT_PERMISSIONS,
                    manageable_roles: [],
                    editable_roles: [],
                    access_scope: 'self',
                    category: 'company_default',
                },
                {
                    name: ENUM_SYSTEM_ROLE.AGENT,
                    type: ENUM_ROLE_TYPE.SYSTEM,
                    isDefault: true,
                    permissions: AGENT_DEFAULT_PERMISSIONS,
                    manageable_roles: [],
                    editable_roles: [],
                    access_scope: 'self',
                    category: 'admin',
                },
                {
                    name: ENUM_SYSTEM_ROLE.VENDOR,
                    type: ENUM_ROLE_TYPE.SYSTEM,
                    isDefault: true,
                    permissions: VENDOR_DEFAULT_PERMISSIONS,
                    manageable_roles: [],
                    editable_roles: [],
                    access_scope: 'self',
                    category: 'admin',
                },
                {
                    name: ENUM_SYSTEM_ROLE.CUSTOMER,
                    type: ENUM_ROLE_TYPE.SYSTEM,
                    isDefault: true,
                    permissions: CUSTOMER_DEFAULT_PERMISSIONS,
                    manageable_roles: [],
                    editable_roles: [],
                    access_scope: 'self',
                    category: 'admin',
                },
            ];

            // Create all roles
            await this.roleService.createManyDefaultRole(roleData);
            console.log('✅ All system roles created with permissions');
            console.log('   - Super Admin (system access)');
            console.log('   - Company Admin (company access)');
            console.log('   - Location Admin (location access)');
            console.log('   - Employee (self access)');
            console.log('   - Agent (self access)');
            console.log('   - Vendor (self access, hidden from tenant UI)');
            console.log('   - Customer (self access, hidden from tenant UI)');

            // Get the Super Admin role for user creation
            const superAdminRole = await this.roleService.findOneByName(ENUM_SYSTEM_ROLE.SUPER_ADMIN);
            if (!superAdminRole) {
                throw new Error('Super Admin role creation failed');
            }

            // Step 3: Create Super Admin User
            console.log('\n👤 Creating Super Admin user...');

            const password = 'Admin@123';
            const salt = this.helperHashService.randomSalt(10);
            const passwordHash = this.helperHashService.bcrypt(password, salt);
            const today = this.helperDateService.create();
            const passwordExpired = this.helperDateService.forward(
                today,
                this.helperDateService.createDuration({ seconds: 365 * 24 * 60 * 60 }) // 1 year
            );
            const passwordCreated = this.helperDateService.create();

            const passwordData = {
                passwordHash,
                passwordExpired,
                passwordCreated,
                salt,
            };

            const adminUser = await this.userService.create(
                {
                    role: String(superAdminRole._id),
                    name: 'System Admin',
                    first_name: 'System',
                    last_name: 'Admin',
                    email: 'admin@admin.com',
                    gender: ENUM_USER_GENDER.MALE,
                    roleLevel: 1,
                },
                passwordData,
                ENUM_USER_SIGN_UP_FROM.SEED
            );
            console.log('✅ Super Admin user created');

            // Step 4: Create Password History
            await this.passwordHistoryService.createByAdmin(adminUser, {
                by: String(adminUser._id),
                type: ENUM_PASSWORD_HISTORY_TYPE.SIGN_UP,
            });
            console.log('✅ Password history created');

            console.log('\n🎉 Fresh initialization completed successfully!');
            console.log('📧 Email: admin@admin.com');
            console.log('🔑 Password: Admin@123');

        } catch (err: any) {
            console.log('\n❌ Fresh initialization error:', err.message);
            throw new Error(err);
        }

        return;
    }
}
