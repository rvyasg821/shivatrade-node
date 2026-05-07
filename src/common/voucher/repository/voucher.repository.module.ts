import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { VoucherSequenceEntity } from './entities/voucher-sequence.entity';
import { VoucherSequenceRepository } from './repositories/voucher-sequence.repository';

@Module({
    providers: [VoucherSequenceRepository],
    exports: [VoucherSequenceRepository],
    imports: [
        TypeOrmModule.forFeature([VoucherSequenceEntity], DATABASE_CONNECTION_NAME),
    ],
})
export class VoucherRepositoryModule {}
