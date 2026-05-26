import { PartialType } from '@nestjs/swagger';
import { PortMasterCreateRequestDto } from './port-master.create.request.dto';

export class PortMasterUpdateRequestDto extends PartialType(
    PortMasterCreateRequestDto
) {}
