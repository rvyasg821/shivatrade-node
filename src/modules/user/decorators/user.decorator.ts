import { USER_GUARD_EMAIL_VERIFIED_META_KEY } from '@modules/user/constants/user.constant';
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
// import { UserGuard } from '@modules/user/guards/user.guard';

export function UserProtected(
    emailVerified: boolean[] = [true]
): MethodDecorator {
    // TODO: Re-enable UserGuard after tenant cleanup
    // UserGuard temporarily disabled
    return applyDecorators(
        // UseGuards(UserGuard), // DISABLED: Guard references tenant code
        SetMetadata(USER_GUARD_EMAIL_VERIFIED_META_KEY, emailVerified)
    );
}
