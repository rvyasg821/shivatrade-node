import { Module } from '@nestjs/common';
import { ShiftRepositoryModule } from './repository/shift.repository.module';
import { UserRepositoryModule } from '@modules/user/repository/user.repository.module';
import { UserModule } from '@modules/user/user.module';
import { RoleModule } from '@modules/role/role.module';
import { LocationModule } from '@modules/location/location.module';
import { ShiftTemplateService } from './services/shift-template.service';
import { ShiftAssignmentService } from './services/shift-assignment.service';
import { ShiftSwapService } from './services/shift-swap.service';
import { ShiftRotaBuilderService } from './services/shift-rota-builder.service';
import { ShiftConflictService } from './services/shift-conflict.service';
import { ShiftNotificationService } from './services/shift-notification.service';

@Module({
    imports: [ShiftRepositoryModule, UserRepositoryModule, UserModule, RoleModule, LocationModule],
    providers: [
        ShiftTemplateService,
        ShiftAssignmentService,
        ShiftSwapService,
        ShiftRotaBuilderService,
        ShiftConflictService,
        ShiftNotificationService,
    ],
    exports: [
        ShiftTemplateService,
        ShiftAssignmentService,
        ShiftSwapService,
        ShiftRotaBuilderService,
        ShiftConflictService,
        ShiftNotificationService,
    ],
})
export class ShiftModule {}
