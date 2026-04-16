import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { PlanService } from '@modules/plan/services/plan.service';

@Injectable()
export class PlanExistsPipe implements PipeTransform {
    constructor(private readonly planService: PlanService) { }

    async transform(value: any): Promise<string> {
        if (!value || typeof value !== 'string') {
            throw new NotFoundException({
                statusCode: 5001,
                message: 'plan.error.notFound',
            });
        }

        const exist: boolean = await this.planService.existByName(value);
        if (exist) {
            throw new NotFoundException({
                statusCode: 5003,
                message: 'plan.error.nameExist',
            });
        }

        return value;
    }
}