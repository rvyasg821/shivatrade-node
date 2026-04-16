import {
    Injectable,
    CanActivate,
    ExecutionContext,
    NotFoundException,
} from '@nestjs/common';
import { DiscountService } from '../services/discount.service';

@Injectable()
export class DiscountExistsGuard implements CanActivate {
    constructor(private readonly discountService: DiscountService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const discountId = request.params.discount || request.params.discountId;

        if (!discountId) {
            throw new NotFoundException('Discount ID is required');
        }

        const discount = await this.discountService.findOneById(discountId);

        if (!discount) {
            throw new NotFoundException(`Discount with ID ${discountId} not found`);
        }

        // Attach discount to request for use in controller
        request.discount = discount;

        return true;
    }
}

@Injectable()
export class DiscountActiveGuard implements CanActivate {
    constructor(private readonly discountService: DiscountService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const discount = request.discount;

        if (!discount) {
            throw new NotFoundException('Discount not found');
        }

        if (discount.status !== 1) {
            throw new NotFoundException('Discount is not active');
        }

        if (discount.is_expired) {
            throw new NotFoundException('Discount has expired');
        }

        if (discount.deletedAt) {
            throw new NotFoundException('Discount has been deleted');
        }

        return true;
    }
}
