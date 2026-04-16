import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DiscountService } from '../services/discount.service';

@Injectable()
export class DiscountExistsMiddleware implements NestMiddleware {
    constructor(private readonly discountService: DiscountService) {}

    async use(req: Request, res: Response, next: NextFunction) {
        const discountId = req.params.discount || req.params.discountId;

        if (discountId) {
            const discount = await this.discountService.findOneById(discountId as string);

            if (!discount) {
                throw new NotFoundException(`Discount with ID ${discountId} not found`);
            }

            // Attach discount to request
            req['discount'] = discount;
        }

        next();
    }
}
