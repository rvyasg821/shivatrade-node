import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { DiscountService } from '../services/discount.service';

@Injectable()
export class DiscountExistsPipe implements PipeTransform {
    constructor(private readonly discountService: DiscountService) {}

    async transform(value: string): Promise<boolean> {
        const discount = await this.discountService.findOneById(value);

        if (!discount) {
            throw new NotFoundException(`Discount with ID ${value} not found`);
        }

        return true;
    }
}
