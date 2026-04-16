import { PickType } from '@nestjs/swagger';
import { DatabaseObjectIdDto } from '../database.object-id.dto';

export class DatabaseIdResponseDto extends PickType(DatabaseObjectIdDto, [
    '_id',
] as const) {}
