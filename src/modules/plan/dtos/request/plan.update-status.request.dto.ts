import { IsEnum, IsNotEmpty } from 'class-validator';
import { ENUM_PLAN_STATUS } from '@modules/plan/enums/plan.enum';

export class PlanUpdateStatusRequestDto {
    @IsEnum(ENUM_PLAN_STATUS)
    @IsNotEmpty()
    status: ENUM_PLAN_STATUS;
}