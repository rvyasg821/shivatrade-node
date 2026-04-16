import { Module } from '@nestjs/common';
import { PayPalService } from './paypal.service';
import { HelperModule } from '@common/helper/helper.module';

@Module({
    providers: [PayPalService],
    exports: [PayPalService],
    imports: [HelperModule],
})
export class PayPalModule { }