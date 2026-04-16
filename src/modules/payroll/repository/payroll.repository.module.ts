import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';

import { PayScheduleEntity } from './entities/pay-schedule.entity';
import { PayRunEntity } from './entities/pay-run.entity';
import { PayslipEntity } from './entities/payslip.entity';
import { PayslipLineItemEntity } from './entities/payslip-line-item.entity';
import { PayElementEntity } from './entities/pay-element.entity';

import { PayScheduleRepository } from './repositories/pay-schedule.repository';
import { PayRunRepository } from './repositories/pay-run.repository';
import { PayslipRepository } from './repositories/payslip.repository';
import { PayslipLineItemRepository } from './repositories/payslip-line-item.repository';
import { PayElementRepository } from './repositories/pay-element.repository';

@Module({
    providers: [
        PayScheduleRepository,
        PayRunRepository,
        PayslipRepository,
        PayslipLineItemRepository,
        PayElementRepository,
    ],
    exports: [
        PayScheduleRepository,
        PayRunRepository,
        PayslipRepository,
        PayslipLineItemRepository,
        PayElementRepository,
    ],
    imports: [
        TypeOrmModule.forFeature(
            [
                PayScheduleEntity,
                PayRunEntity,
                PayslipEntity,
                PayslipLineItemEntity,
                PayElementEntity,
            ],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class PayrollRepositoryModule {}
