import { PartialType } from '@nestjs/swagger';
import { UomCreateRequestDto } from './uom.create.request.dto';

export class UomUpdateRequestDto extends PartialType(UomCreateRequestDto) {}
