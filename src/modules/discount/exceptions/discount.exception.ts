import { HttpException, HttpStatus } from '@nestjs/common';

export class DiscountNotFoundException extends HttpException {
    constructor(id?: string) {
        super(
            {
                statusCode: HttpStatus.NOT_FOUND,
                message: id
                    ? `Discount with ID ${id} not found`
                    : 'Discount not found',
                error: 'DiscountNotFoundException',
            },
            HttpStatus.NOT_FOUND
        );
    }
}

export class DiscountCodeNotFoundException extends HttpException {
    constructor(code: string) {
        super(
            {
                statusCode: HttpStatus.NOT_FOUND,
                message: `Discount code '${code}' not found`,
                error: 'DiscountCodeNotFoundException',
            },
            HttpStatus.NOT_FOUND
        );
    }
}

export class DiscountCodeExpiredException extends HttpException {
    constructor(code: string) {
        super(
            {
                statusCode: HttpStatus.BAD_REQUEST,
                message: `Discount code '${code}' has expired`,
                error: 'DiscountCodeExpiredException',
            },
            HttpStatus.BAD_REQUEST
        );
    }
}

export class DiscountCodeInactiveException extends HttpException {
    constructor(code: string) {
        super(
            {
                statusCode: HttpStatus.BAD_REQUEST,
                message: `Discount code '${code}' is inactive`,
                error: 'DiscountCodeInactiveException',
            },
            HttpStatus.BAD_REQUEST
        );
    }
}

export class DiscountMaxUsageExceededException extends HttpException {
    constructor(code: string) {
        super(
            {
                statusCode: HttpStatus.BAD_REQUEST,
                message: `Discount code '${code}' has reached maximum usage limit`,
                error: 'DiscountMaxUsageExceededException',
            },
            HttpStatus.BAD_REQUEST
        );
    }
}

export class DiscountCodeAlreadyExistsException extends HttpException {
    constructor(code: string) {
        super(
            {
                statusCode: HttpStatus.CONFLICT,
                message: `Discount code '${code}' already exists`,
                error: 'DiscountCodeAlreadyExistsException',
            },
            HttpStatus.CONFLICT
        );
    }
}

export class DiscountInvalidAmountException extends HttpException {
    constructor() {
        super(
            {
                statusCode: HttpStatus.BAD_REQUEST,
                message: 'Invalid amount provided for discount calculation',
                error: 'DiscountInvalidAmountException',
            },
            HttpStatus.BAD_REQUEST
        );
    }
}
