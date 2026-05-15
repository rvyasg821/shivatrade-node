import { PartialType } from '@nestjs/swagger';
import { CurrencyCreateRequestDto } from './currency.create.request.dto';

export class CurrencyUpdateRequestDto extends PartialType(CurrencyCreateRequestDto) {}
