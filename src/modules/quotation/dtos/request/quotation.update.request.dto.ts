import { PartialType } from '@nestjs/swagger';
import { QuotationCreateRequestDto } from './quotation.create.request.dto';

export class QuotationUpdateRequestDto extends PartialType(QuotationCreateRequestDto) {}
