import { Module } from '@nestjs/common';
import { PortMasterRepositoryModule } from './repository/port-master.repository.module';
import { PortMasterService } from './services/port-master.service';
import { PortMasterAdminController } from './controllers/port-master.admin.controller';

@Module({
    imports: [PortMasterRepositoryModule],
    providers: [PortMasterService],
    exports: [PortMasterRepositoryModule, PortMasterService],
    controllers: [PortMasterAdminController],
})
export class PortMasterModule {}
