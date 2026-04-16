import { Module, forwardRef } from '@nestjs/common';
import { SharedUserRepositoryModule } from '@modules/shared-users/repository/shared-user.repository.module';
import { SharedUserService } from '@modules/shared-users/services/shared-user.service';
import { SharedUserSyncService } from '@modules/shared-users/services/shared-user-sync.service';
import { UserModule } from '@modules/user/user.module';
import { CompanyModule } from '@modules/company/company.module';
import { RoleModule } from '@modules/role/role.module';

@Module({
    providers: [
        SharedUserService,
        SharedUserSyncService,
    ],
    exports: [
        SharedUserService,
        SharedUserSyncService,
    ],
    controllers: [],
    imports: [
        forwardRef(() =>SharedUserRepositoryModule),
        forwardRef(() => UserModule),
        forwardRef(() => CompanyModule),
        forwardRef(() => RoleModule),],
})
export class SharedUserModule {}