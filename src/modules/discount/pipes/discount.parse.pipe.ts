import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { DiscountService } from '../services/discount.service';
import { DiscountDoc } from '../repository/entities/discount.entity';

@Injectable()
export class DiscountParsePipe implements PipeTransform {
    constructor(private readonly discountService: DiscountService) {}

    async transform(value: string): Promise<DiscountDoc> {
        const discount = await this.discountService.findOneById(value);

        if (!discount) {
            throw new NotFoundException('Discount not found');
        }

        return discount;
    }
}
