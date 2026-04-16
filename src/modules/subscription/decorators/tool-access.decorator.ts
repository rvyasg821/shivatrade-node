import { SetMetadata } from '@nestjs/common';

export const TOOL_ACCESS_KEY = 'tool_access';

export const RequireToolAccess = (toolIds: string[]) =>
    SetMetadata(TOOL_ACCESS_KEY, toolIds);