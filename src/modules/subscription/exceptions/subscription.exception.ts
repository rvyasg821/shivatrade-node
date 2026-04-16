import { HttpException, HttpStatus } from '@nestjs/common';
import { ENUM_SUBSCRIPTION_STATUS_CODE_ERROR } from '../enums/subscription.enum';

export class SubscriptionNotFoundException extends HttpException {
    constructor(id: string) {
        super(
            {
                statusCode: ENUM_SUBSCRIPTION_STATUS_CODE_ERROR.NOT_FOUND,
                message: `Subscription with id ${id} not found`,
                error: 'Subscription Not Found',
            },
            HttpStatus.NOT_FOUND
        );
    }
}

export class SubscriptionAlreadyExistsException extends HttpException {
    constructor(userId: string) {
        super(
            {
                statusCode: ENUM_SUBSCRIPTION_STATUS_CODE_ERROR.ALREADY_EXISTS,
                message: `User ${userId} already has an active subscription`,
                error: 'Subscription Already Exists',
            },
            HttpStatus.CONFLICT
        );
    }
}

export class SubscriptionExpiredException extends HttpException {
    constructor(id: string) {
        super(
            {
                statusCode: ENUM_SUBSCRIPTION_STATUS_CODE_ERROR.EXPIRED,
                message: `Subscription ${id} has expired`,
                error: 'Subscription Expired',
            },
            HttpStatus.FORBIDDEN
        );
    }
}

export class SubscriptionSuspendedException extends HttpException {
    constructor(id: string) {
        super(
            {
                statusCode: ENUM_SUBSCRIPTION_STATUS_CODE_ERROR.SUSPENDED,
                message: `Subscription ${id} is suspended`,
                error: 'Subscription Suspended',
            },
            HttpStatus.FORBIDDEN
        );
    }
}

export class SubscriptionCancelledException extends HttpException {
    constructor(id: string) {
        super(
            {
                statusCode: ENUM_SUBSCRIPTION_STATUS_CODE_ERROR.CANCELLED,
                message: `Subscription ${id} has been cancelled`,
                error: 'Subscription Cancelled',
            },
            HttpStatus.FORBIDDEN
        );
    }
}

export class InvalidPlanException extends HttpException {
    constructor(planId: string) {
        super(
            {
                statusCode: ENUM_SUBSCRIPTION_STATUS_CODE_ERROR.INVALID_PLAN,
                message: `Plan ${planId} is invalid or inactive`,
                error: 'Invalid Plan',
            },
            HttpStatus.BAD_REQUEST
        );
    }
}

export class InvalidToolsPlanCombinationException extends HttpException {
    constructor() {
        super(
            {
                statusCode: ENUM_SUBSCRIPTION_STATUS_CODE_ERROR.INVALID_TOOLS_PLAN_COMBINATION,
                message: 'Cannot select a plan without selecting any tools. Please select at least one tool or remove the plan selection.',
                error: 'Invalid Tools and Plan Combination',
            },
            HttpStatus.BAD_REQUEST
        );
    }
}

// Export tool provisioning exceptions
export {
    ToolProvisioningException,
    TenantConnectionException,
    ToolDataValidationException,
    ProvisioningRollbackException,
} from './tool-provisioning.exception';