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

        const plan: PlanDoc = await this.planService.findOneById(value);
        if (!plan) {
            throw new PlanNotFoundException(value);
        }

        return plan;
    }
}