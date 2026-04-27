import { PartialType } from '@nestjs/swagger';
import { CategoryCreateRequestDto } from './category.create.request.dto';

export class CategoryUpdateRequestDto extends PartialType(
    CategoryCreateRequestDto
) {}
