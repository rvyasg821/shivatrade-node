import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { DiscountService } from '../services/discount.service';
import { DiscountDoc } from '../repository/entities/discount.entity';

@Injectable()
export class DiscountParsePipe implements PipeTransform {
    constructor(private readonly discountService: DiscountService) {}

    async transform(value: string): Promise<DiscountDoc> {
        // A non-UUID value previously threw a raw, uncaught Postgres
        // "invalid input syntax for uuid" error -> unhandled 500 instead of
        // a clean 404 (found via a full-app test pass, same class of gap
        // fixed on User/Role/Country/Inventory). Mirrors ToolsParsePipe.
        let discount: DiscountDoc | undefined;
        try {
            discount = await this.discountService.findOneById(value);
        } catch {
            discount = undefined;
        }

        if (!discount) {
            throw new NotFoundException('Discount not found');
        }

        return discount;
    }
}
