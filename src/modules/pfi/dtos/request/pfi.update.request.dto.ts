import { PartialType } from '@nestjs/swagger';
import { PfiCreateRequestDto } from './pfi.create.request.dto';

export class PfiUpdateRequestDto extends PartialType(PfiCreateRequestDto) {}
