import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONNECTION_NAME } from '@common/database/constants/database.constant';
import { DiscountEntity } from './entities/discount.entity';
import { DiscountAppliedEntity } from './entities/discount-applied.entity';
import { DiscountRepository } from './repositories/discount.repository';
import { DiscountAppliedRepository } from './repositories/discount-applied.repository';

@Module({
    providers: [DiscountRepository, DiscountAppliedRepository],
    exports: [DiscountRepository, DiscountAppliedRepository],
    imports: [
        TypeOrmModule.forFeature(
            [DiscountEntity, DiscountAppliedEntity],
            DATABASE_CONNECTION_NAME
        ),
    ],
})
export class DiscountRepositoryModule {}
