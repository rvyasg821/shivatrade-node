import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { OTPEntity } from './entities/otp.entity';
import { OTPRepository } from './repositories/otp.repository';

@Module({
    providers: [OTPRepository],
    exports: [OTPRepository],
    controllers: [],
    imports: [
        TypeOrmModule.forFeature(
            [OTPEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class OTPRepositoryModule {}
