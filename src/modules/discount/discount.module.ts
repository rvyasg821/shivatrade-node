import { Module } from '@nestjs/common';
import { DiscountRepositoryModule } from './repository/discount.repository.module';
import { DiscountService } from './services/discount.service';
import { DiscountParsePipe } from './pipes/discount.parse.pipe';
import { PaginationModule } from '@common/pagination/pagination.module';
import { HelperModule } from '@common/helper/helper.module';

@Module({
    imports: [
        DiscountRepositoryModule,
        PaginationModule,
        HelperModule,
    ],
    exports: [DiscountService],
    providers: [
        DiscountService,
        DiscountParsePipe,
    ],
    controllers: [],
})
export class DiscountModule {}
