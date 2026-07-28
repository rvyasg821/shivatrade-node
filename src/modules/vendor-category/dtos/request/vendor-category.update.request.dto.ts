import { PartialType } from '@nestjs/swagger';
import { VendorCategoryCreateRequestDto } from './vendor-category.create.request.dto';

export class VendorCategoryUpdateRequestDto extends PartialType(
    VendorCategoryCreateRequestDto
) {}
