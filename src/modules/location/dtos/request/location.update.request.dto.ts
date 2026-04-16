import { PartialType } from '@nestjs/swagger';
import { LocationCreateRequestDto } from './location.create.request.dto';

export class LocationUpdateRequestDto extends PartialType(
    LocationCreateRequestDto
) {}
