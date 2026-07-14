import { PartialType } from '@nestjs/swagger';
import { StateCreateRequestDto } from './state.create.request.dto';

/** Every field optional — the edit screen sends only what changed. */
export class StateUpdateRequestDto extends PartialType(StateCreateRequestDto) {}
