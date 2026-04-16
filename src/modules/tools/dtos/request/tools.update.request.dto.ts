import { PartialType } from '@nestjs/mapped-types';
import { ToolsCreateRequestDto } from '@modules/tools/dtos/request/tools.create.request.dto';
import { OmitType } from '@nestjs/swagger';

export class ToolsUpdateRequestDto extends PartialType(OmitType(ToolsCreateRequestDto, ['slug'])) { }