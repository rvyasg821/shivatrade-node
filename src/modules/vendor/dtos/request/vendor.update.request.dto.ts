import { PartialType } from '@nestjs/swagger';
import { VendorCreateRequestDto } from './vendor.create.request.dto';

export class VendorUpdateRequestDto extends PartialType(VendorCreateRequestDto) {}
