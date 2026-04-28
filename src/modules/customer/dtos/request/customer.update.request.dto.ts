import { PartialType } from '@nestjs/swagger';
import { CustomerCreateRequestDto } from './customer.create.request.dto';

export class CustomerUpdateRequestDto extends PartialType(CustomerCreateRequestDto) {}
