import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { ENUM_PLAN_STATUS_CODE_ERROR } from '@modules/plan/enums/plan.status-code.enum';

export class PlanNotFoundException extends NotFoundException {
    constructor(planId?: string) {
        super({
            statusCode: ENUM_PLAN_STATUS_CODE_ERROR.NOT_FOUND,
            message: 'plan.error.notFound',
            _metadata: {
                planId,
            },
        });
    }
}

export class PlanInactiveException extends BadRequestException {
    constructor(planId: string) {
        super({
            statusCode: ENUM_PLAN_STATUS_CODE_ERROR.INACTIVE,
            message: 'plan.error.inactive',
            _metadata: {
                planId,
            },
        });
    }
}

export class PlanAlreadyExistsException extends ConflictException {
    constructor(name: string) {
        super({
            statusCode: ENUM_PLAN_STATUS_CODE_ERROR.ALREADY_EXISTS,
            message: 'plan.error.nameExist',
            _metadata: {
                name,
            },
        });
    }
}

export class DefaultPlanDeletionException extends BadRequestException {
    constructor(planId: string) {
        super({
            statusCode: ENUM_PLAN_STATUS_CODE_ERROR.DEFAULT_PLAN_DELETION,
            message: 'plan.error.defaultPlanDeletion',
            _metadata: {
                planId,
            },
        });
    }
}

export class PlanInvalidStatusException extends BadRequestException {
    constructor(status: string) {
        super({
            statusCode: ENUM_PLAN_STATUS_CODE_ERROR.INVALID_STATUS,
            message: 'plan.error.invalidStatus',
            _metadata: {
                status,
            },
        });
    }
}

export class PlanInvalidPriceException extends BadRequestException {
    constructor(price: any) {
        super({
            statusCode: ENUM_PLAN_STATUS_CODE_ERROR.INVALID_PRICE,
            message: 'plan.error.invalidPrice',
            _metadata: {
                price,
            },
        });
    }
}