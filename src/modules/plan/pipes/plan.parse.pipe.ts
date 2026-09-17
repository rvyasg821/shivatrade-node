import { Injectable, PipeTransform } from '@nestjs/common';
import { PlanDoc } from '@modules/plan/repository/entities/plan.entity';
import { PlanService } from '@modules/plan/services/plan.service';
import { PlanNotFoundException } from '@modules/plan/exceptions/plan.exception';

@Injectable()
export class PlanParsePipe implements PipeTransform {
    constructor(private readonly planService: PlanService) { }

    async transform(value: any): Promise<PlanDoc> {
        if (!value || typeof value !== 'string') {
            throw new PlanNotFoundException();
        }

        // The typeof check above only rejects null/undefined/non-string —
        // a malformed-but-string value (e.g. "me") still reached a raw,
        // uncaught Postgres "invalid input syntax for uuid" error here
        // (same class of gap fixed on User/Role/Country/Discount/
        // Inventory/Subscription this session).
        let plan: PlanDoc | undefined;
        try {
            plan = await this.planService.findOneById(value);
        } catch {
            plan = undefined;
        }
        if (!plan) {
            throw new PlanNotFoundException(value);
        }

        return plan;
    }
}