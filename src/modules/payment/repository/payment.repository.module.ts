import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { PaymentEntity } from './entities/payment.entity';
import { PaymentRepository } from './repositories/payment.repository';

@Module({
    providers: [PaymentRepository],
    exports: [PaymentRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [PaymentEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class PaymentRepositoryModule { }
