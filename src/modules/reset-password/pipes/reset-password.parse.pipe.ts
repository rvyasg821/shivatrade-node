import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { ResetPasswordDoc } from '@modules/reset-password/repository/entities/reset-password.entity';
import { ResetPasswordService } from '@modules/reset-password/services/reset-password.service';
import { ENUM_ROLE_STATUS_CODE_ERROR } from '@modules/role/enums/role.status-code.enum';

@Injectable()
export class ResetPasswordParseByTokenPipe implements PipeTransform {
    constructor(private readonly resetPasswordService: ResetPasswordService) {
    }

    async transform(value: string): Promise<ResetPasswordDoc> {
        // Defensive wrap matching the fix applied across every other
        // ID-lookup pipe this session (User/Role/Country/Discount/
        // Inventory) — any lookup error (malformed token, DB hiccup)
        // degrades to a clean 404 instead of an unhandled 500.
        let resetPassword: ResetPasswordDoc | undefined;
        try {
            resetPassword = await this.resetPasswordService.findOneByToken(value);
        } catch {
            resetPassword = undefined;
        }
        if (!resetPassword) {
            throw new NotFoundException({
                statusCode: ENUM_ROLE_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'resetPassword.error.notFound',
            });
        }

        return resetPassword;
    }
}
