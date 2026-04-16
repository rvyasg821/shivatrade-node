import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { LeaveTypeEntity } from './entities/leave-type.entity';
import { LeaveEntitlementEntity } from './entities/leave-entitlement.entity';
import { LeaveRequestEntity } from './entities/leave-request.entity';
import { LeavePolicyEntity } from './entities/leave-policy.entity';
import { LeaveTypeRepository } from './repositories/leave-type.repository';
import { LeaveEntitlementRepository } from './repositories/leave-entitlement.repository';
import { LeaveRequestRepository } from './repositories/leave-request.repository';
import { LeavePolicyRepository } from './repositories/leave-policy.repository';

@Module({
    providers: [
        LeaveTypeRepository,
        LeaveEntitlementRepository,
        LeaveRequestRepository,
        LeavePolicyRepository,
    ],
    exports: [
        LeaveTypeRepository,
        LeaveEntitlementRepository,
        LeaveRequestRepository,
        LeavePolicyRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [
                LeaveTypeEntity,
                LeaveEntitlementEntity,
                LeaveRequestEntity,
                LeavePolicyEntity,
            ],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class LeaveRepositoryModule {}
