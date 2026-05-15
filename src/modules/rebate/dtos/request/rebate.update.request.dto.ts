import { PartialType } from '@nestjs/swagger';
import { RebateCreateRequestDto } from './rebate.create.request.dto';

export class RebateUpdateRequestDto extends PartialType(RebateCreateRequestDto) {}
