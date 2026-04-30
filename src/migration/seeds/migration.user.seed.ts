import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { UserService } from '@modules/user/services/user.service';
import { RoleDoc } from '@modules/role/repository/entities/role.entity';
import { RoleService } from '@modules/role/services/role.service';
import { ENUM_USER_GENDER, ENUM_USER_SIGN_UP_FROM } from '@modules/user/enums/user.enum';
import { PasswordHistoryService } from '@modules/password-history/services/password-history.service';
import { ActivityService } from '@modules/activity/services/activity.service';
import { ENUM_PASSWORD_HISTORY_TYPE } from '@modules/password-history/enums/password-history.enum';
import { SessionService } from '@modules/session/services/session.service';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { HelperHashService } from '@common/helper/services/helper.hash.service';
import { HelperDateService } from '@common/helper/services/helper.date.service';

@Injectable()
export class MigrationUserSeed {
    constructor(
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly passwordHistoryService: PasswordHistoryService,
        private readonly activityService: ActivityService,
        private readonly sessionService: SessionService,
        private readonly helperHashService: HelperHashService,
        private readonly helperDateService: HelperDateService,
    ) { }

    @Command({
        command: 'seed:user',
        describe: 'seed users',
    })
    async seeds(): Promise<void> {
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

        // Find system roles by their enum names
        const adminRole: RoleDoc = await this.roleService.findOneByName(ENUM_SYSTEM_ROLE.SUPER_ADMIN);
        const companyAdminRole: RoleDoc = await this.roleService.findOneByName(ENUM_SYSTEM_ROLE.COMPANY_ADMIN);

        if (!adminRole) {
            throw new Error('Admin role not found. Please run role seeds first.');
        }

        if (!companyAdminRole) {
            throw new Error('Company Admin role not found. Please run role seeds first.');
        }

        try {
            const existingAdmin = await this.userService.findOneByEmail('admin@admin.com');

            if (existingAdmin) {
                console.log('✅ System users already exists.');
                return;
            }
            const users = await Promise.all([
                this.userService.create(
                    {
                        role: String(adminRole._id),
                        name: 'System Admin',
                        first_name: 'System',
                        last_name: 'Admin',
                        email: 'admin@admin.com',
                        gender: ENUM_USER_GENDER.MALE,
                        roleLevel: 1,
                    },
                    passwordData,
                    ENUM_USER_SIGN_UP_FROM.SEED
                ),
            ]);

            for (const user of users) {
                const userId = String(user._id);

                await this.passwordHistoryService.createByAdmin(user, {
                    by: userId,
                    type: ENUM_PASSWORD_HISTORY_TYPE.SIGN_UP,
                });
            }

            console.log('✅ System users seeded successfully');
        } catch (err: any) {
            console.log("❌ User seeds error:", err);
            throw new Error(err);
        }

        return;
    }

    @Command({
        command: 'remove:user',
        describe: 'remove users',
    })
    async remove(): Promise<void> {
        try {
            await this.activityService.deleteMany();
            await this.passwordHistoryService.deleteMany();
            await this.sessionService.resetLoginSession();
            await this.sessionService.deleteMany();

            await this.userService.deleteMany();
            console.log('✅ Users removed successfully');
        } catch (err: any) {
            console.log("❌ Remove users error:", err);
            throw new Error(err);
        }

        return;
    }
}
