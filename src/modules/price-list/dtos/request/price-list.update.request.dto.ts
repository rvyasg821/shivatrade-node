import { PartialType } from '@nestjs/swagger';
import { PriceListCreateRequestDto } from './price-list.create.request.dto';

export class PriceListUpdateRequestDto extends PartialType(PriceListCreateRequestDto) {}
