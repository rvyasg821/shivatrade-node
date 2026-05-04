import { PartialType } from '@nestjs/swagger';
import { LeadCreateRequestDto } from './lead.create.request.dto';

export class LeadUpdateRequestDto extends PartialType(LeadCreateRequestDto) {}
