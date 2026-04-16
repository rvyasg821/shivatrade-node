import { Module } from '@nestjs/common';

import { HealthSystemController } from '@modules/health/controllers/health.system.controller';
import { HealthModule } from '@modules/health/health.module';
import { RoleModule } from '@modules/role/role.module';
import { SettingSystemController } from '@modules/setting/controllers/setting.system.controller';
import { SettingModule } from '@modules/setting/setting.module';
import { UserModule } from '@modules/user/user.module';

@Module({
    controllers: [
        HealthSystemController,
        SettingSystemController,
    ],
    providers: [],
    exports: [],
    imports: [
        HealthModule,
        SettingModule,
        UserModule,
        RoleModule,
        HealthModule,
    ],
})
export class RoutesSystemModule {}
