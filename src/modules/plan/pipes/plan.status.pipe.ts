import { Injectable, BadRequestException, PipeTransform } from '@nestjs/common';
import { ENUM_PLAN_STATUS } from '@modules/plan/enums/plan.enum';

@Injectable()
export class PlanStatusPipe implements PipeTransform {
    constructor() { }

    async transform(value: any): Promise<ENUM_PLAN_STATUS> {
        if (!value) {
            throw new BadRequestException({
                statusCode: 5005,
                message: 'plan.error.invalidStatus',
            });
        }

        const status = value.toUpperCase();
        if (!Object.values(ENUM_PLAN_STATUS).includes(status)) {
            throw new BadRequestException({
                statusCode: 5005,
                message: 'plan.error.invalidStatus',
            });
        }

        return status as ENUM_PLAN_STATUS;
    }
}