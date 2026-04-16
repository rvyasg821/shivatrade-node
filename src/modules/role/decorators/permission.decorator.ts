import { SetMetadata } from '@nestjs/common';
import { IPermissionMetadata, PERMISSION_KEY } from '@modules/role/guards/permission.guard';

export const Permission = (module: string, action: string) =>
    SetMetadata(PERMISSION_KEY, { module, action } as IPermissionMetadata);