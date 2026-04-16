// File temporarily disabled during multi-tenant removal
// Original file saved as: user.guard.ts.disabled

import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';

@Injectable()
export class UserGuard implements CanActivate {
    private readonly logger = new Logger(UserGuard.name);

    constructor() {
        this.logger.warn('UserGuard is currently disabled during multi-tenant removal');
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Stub implementation - always returns true (no validation)
        this.logger.warn('UserGuard.canActivate called but guard is disabled - allowing access');
        return true;
    }
}
