import { EmailMobileNumberVerifiedDto } from '@modules/email/dtos/email.mobile-number-verified.dto';
import { EmailResetPasswordDto } from '@modules/email/dtos/email.reset-password.dto';
import { EmailSendDto } from '@modules/email/dtos/email.send.dto';
import { EmailTempPasswordDto } from '@modules/email/dtos/email.temp-password.dto';
import { EmailVerificationDto } from '@modules/email/dtos/email.verification.dto';
import { EmailVerifiedDto } from '@modules/email/dtos/email.verified.dto';

export interface IEmailService {
    sendChangePassword({ name, email }: EmailSendDto, companyId?: string, locationId?: string): Promise<boolean>;
    sendWelcome({ name, email }: EmailSendDto, companyId?: string, locationId?: string): Promise<boolean>;
    sendCreate(
        { name, email }: EmailSendDto,
        { password, passwordExpiredAt }: EmailTempPasswordDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean>;
    sendTempPassword(
        { name, email }: EmailSendDto,
        { password, passwordExpiredAt }: EmailTempPasswordDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean>;
    sendResetPassword(
        { name, email }: EmailSendDto,
        { expiredDate, url }: EmailResetPasswordDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean>;
    sendVerification(
        { name, email }: EmailSendDto,
        { expiredAt, reference, otp }: EmailVerificationDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean>;
    sendEmailVerified(
        { name, email }: EmailSendDto,
        { reference }: EmailVerifiedDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean>;
    sendMobileNumberVerified(
        { name, email }: EmailSendDto,
        { reference, mobileNumber }: EmailMobileNumberVerifiedDto,
        companyId?: string,
        locationId?: string
    ): Promise<boolean>;
}
