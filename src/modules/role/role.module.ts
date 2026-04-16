import { Module, forwardRef } from '@nestjs/common';
import { RoleRepositoryModule } from '@modules/role/repository/role.repository.module';
import { RoleService } from '@modules/role/services/role.service';
import { RoleAccessHelper } from '@modules/role/helpers/role-access.helper';
import { RoleAdminController } from '@modules/role/controllers/role.admin.controller';
import { RoleSharedController } from '@modules/role/controllers/role.shared.controller';
import { RoleSystemController } from '@modules/role/controllers/role.system.controller';
import { PermissionGuard } from '@modules/role/guards/permission.guard';
import { UserModule } from '@modules/user/user.module';
import { CompanyModule } from '@modules/company/company.module';
@Module({
    controllers: [
        // Controllers removed from here to avoid circular dependency issues
        // They should be imported by the main app module that has access to UserModule and AuthModule
    ],
    providers: [
        RoleService,
        RoleAccessHelper,
        PermissionGuard,
    ],
    exports: [
        RoleService,
        RoleAccessHelper,
        PermissionGuard,
    ],
    imports: [
        RoleRepositoryModule,
        forwardRef(() => UserModule),
        forwardRef(() => CompanyModule),],
})
export class RoleModule { }
