import { PartialType } from '@nestjs/mapped-types';
import { PlanCreateRequestDto } from '@modules/plan/dtos/request/plan.create.request.dto';

export class PlanUpdateRequestDto extends PartialType(PlanCreateRequestDto) { }