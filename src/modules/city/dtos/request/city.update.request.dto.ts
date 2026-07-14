import { PartialType } from '@nestjs/swagger';
import { CityCreateRequestDto } from './city.create.request.dto';

export class CityUpdateRequestDto extends PartialType(CityCreateRequestDto) {}
