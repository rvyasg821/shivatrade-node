import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { DiscountDoc } from '../repository/entities/discount.entity';

export const GetDiscount = createParamDecorator(
    (data: string, ctx: ExecutionContext): DiscountDoc => {
        const request = ctx.switchToHttp().getRequest();
        const discount = request.discount;

        return data ? discount?.[data] : discount;
    }
);

export const GetDiscountId = createParamDecorator(
    (data: string, ctx: ExecutionContext): string => {
        const request = ctx.switchToHttp().getRequest();
        const discount = request.discount;

        return discount?._id?.toString();
    }
);
