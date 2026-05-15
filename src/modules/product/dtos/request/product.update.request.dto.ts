import { PartialType } from '@nestjs/swagger';
import { ProductCreateRequestDto } from './product.create.request.dto';

export class ProductUpdateRequestDto extends PartialType(
    ProductCreateRequestDto
) {}
