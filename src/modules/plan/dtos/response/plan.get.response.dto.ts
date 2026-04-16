import { Expose } from 'class-transformer';
import { PlanListResponseDto } from '@modules/plan/dtos/response/plan.list.response.dto';

export class PlanGetResponseDto extends PlanListResponseDto {
    @Expose()
    metadata: Record<string, any>;
}