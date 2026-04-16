import { Injectable, Logger } from '@nestjs/common';
import { OTPRepository } from '../repository/repositories/otp.repository';
import { HelperHashService } from '@common/helper/services/helper.hash.service';
import { NodemailerService } from '@modules/email/services/nodemailer.service';
import { OTPEntity } from '../repository/entities/otp.entity';
import { APP_NAME } from '@app/constants/app.constant';

export interface IOTPGenerateResponse {
    success: boolean;
    message: string;
    data?: {
        email: string;
        expiresIn: number; // seconds
        otp?: string; // For testing purposes only
    };
}

export interface IOTPVerifyResponse {
    success: boolean;
    message: string;
    data?: {
        email: string;
        verified: boolean;
    };
}

@Injectable()
export class OTPService {
    private readonly logger = new Logger(OTPService.name);
    private readonly OTP_EXPIRY_MINUTES = 5;
    private readonly MAX_ATTEMPTS = 5;

    constructor(
        private readonly otpRepository: OTPRepository,
        private readonly helperHashService: HelperHashService,
        private readonly nodemailerService: NodemailerService
    ) { }

    async generateOTP(email: string): Promise<IOTPGenerateResponse> {
        try {
            this.logger.log(`[OTP Service] ===== GENERATE OTP START =====`);
            this.logger.log(`[OTP Service] Input email: "${email}"`);

            // Validate email format
            if (!this.isValidEmail(email)) {
                this.logger.error(`[OTP Service] Invalid email format: "${email}"`);
                return {
                    success: false,
                    message: 'Invalid email format',
                };
            }

            // Generate 6-digit OTP
            const otp = this.generateSixDigitOTP();
            this.logger.log(`[OTP Service] Generated OTP: ${otp} for email: ${email}`);

            // Calculate expiration time (5 minutes from now)
            const expiresAt = new Date();
            expiresAt.setMinutes(
                expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES
            );
            this.logger.log(`[OTP Service] OTP expires at: ${expiresAt.toISOString()}`);
            this.logger.log(`[OTP Service] Current server time: ${new Date().toISOString()}`);

            // Delete any existing OTPs for this email
            this.logger.log(`[OTP Service] Deleting any existing OTPs for: ${email.toLowerCase()}`);
            await this.otpRepository.deleteByEmail(email);

            // Create new OTP record
            const otpEntity = new OTPEntity();
            otpEntity.email = email.toLowerCase();
            otpEntity.otpHash = otp;
            otpEntity.expiresAt = expiresAt;
            otpEntity.attempts = 0;

            this.logger.log(`[OTP Service] Creating OTP record:`);
            this.logger.log(`[OTP Service]   - Email (stored): "${otpEntity.email}"`);
            this.logger.log(`[OTP Service]   - OTP Hash: "${otpEntity.otpHash}"`);
            this.logger.log(`[OTP Service]   - Expires At: ${otpEntity.expiresAt}`);

            await this.otpRepository.create<OTPEntity>(otpEntity, {});
            this.logger.log(`[OTP Service] OTP record saved to database`);

            // Send OTP via email
            this.logger.log(`[OTP Service] Sending OTP email to: ${email}`);
            const emailSent = await this.sendOTPEmail(email, otp);

            if (!emailSent) {
                this.logger.error(`[OTP Service] Failed to send OTP email to: ${email}`);
                // Clean up the OTP record if email sending failed
                await this.otpRepository.deleteByEmail(email);
                return {
                    success: false,
                    message: 'Failed to send OTP email. Please try again.',
                };
            }

            this.logger.log(`[OTP Service] SUCCESS - OTP sent to: ${email}`);
            this.logger.log(`[OTP Service] ===== GENERATE OTP END =====`);

            return {
                success: true,
                message: 'OTP sent successfully to your email address',
                data: {
                    email: email.toLowerCase(),
                    expiresIn: this.OTP_EXPIRY_MINUTES * 60, // Convert to seconds
                    otp: String(otp), // For testing purposes only
                },
            };
        } catch (error) {
            this.logger.error(
                `[OTP Service] EXCEPTION during OTP generation for ${email}:`,
                error
            );
            return {
                success: false,
                message: 'Failed to generate OTP. Please try again.',
            };
        }
    }

    async verifyOTP(email: string, otp: string): Promise<IOTPVerifyResponse> {
        try {
            this.logger.log(`[OTP Service] ===== VERIFY OTP START =====`);
            this.logger.log(`[OTP Service] Input email: "${email}"`);
            this.logger.log(`[OTP Service] Input OTP: "${otp}"`);

            // Validate inputs
            if (!this.isValidEmail(email)) {
                this.logger.error(`[OTP Service] Invalid email format: "${email}"`);
                return {
                    success: false,
                    message: 'Invalid email format',
                };
            }

            if (!this.isValidOTP(otp)) {
                this.logger.error(`[OTP Service] Invalid OTP format: "${otp}" (length: ${otp?.length})`);
                return {
                    success: false,
                    message: 'Invalid OTP format. OTP must be 6 digits.',
                };
            }

            // Test Mode: Allow generic OTP '123456' for test emails or dev environment
            if (otp === '123456' && (process.env.NODE_ENV !== 'production' || email.startsWith('test-'))) {
                this.logger.log(`[OTP Service] Test OTP verified for email: ${email}`);

                // Clean up any existing OTP to keep DB clean
                await this.otpRepository.deleteByEmail(email);

                return {
                    success: true,
                    message: 'Email verified successfully (Test Mode)',
                    data: {
                        email: email.toLowerCase(),
                        verified: true,
                    },
                };
            }

            // Find valid OTP record
            this.logger.log(`[OTP Service] Looking up OTP record for: ${email.toLowerCase()}`);
            const otpRecord =
                await this.otpRepository.findValidOTPByEmail(email);

            if (!otpRecord) {
                this.logger.error(`[OTP Service] No valid OTP record found for: ${email}`);
                this.logger.error(`[OTP Service] Possible reasons: OTP expired, max attempts exceeded, or never generated`);
                return {
                    success: false,
                    message:
                        'OTP not found, expired, or maximum attempts exceeded',
                };
            }

            this.logger.log(`[OTP Service] OTP record found:`);
            this.logger.log(`[OTP Service]   - DB Email: "${otpRecord.email}"`);
            this.logger.log(`[OTP Service]   - DB OTP Hash: "${otpRecord.otpHash}"`);
            this.logger.log(`[OTP Service]   - Expires At: ${otpRecord.expiresAt}`);
            this.logger.log(`[OTP Service]   - Current Time: ${new Date()}`);
            this.logger.log(`[OTP Service]   - Attempts: ${otpRecord.attempts}`);

            // Verify OTP
            const isValidOTP = otpRecord.otpHash === otp;
            this.logger.log(`[OTP Service] OTP comparison: "${otpRecord.otpHash}" === "${otp}" = ${isValidOTP}`);

            if (!isValidOTP) {
                // Increment attempt count
                await this.otpRepository.incrementAttempts(
                    otpRecord._id.toString()
                );
                this.logger.error(`[OTP Service] OTP mismatch! Attempt count incremented.`);

                return {
                    success: false,
                    message: 'Invalid OTP. Please check and try again.',
                };
            }

            // OTP is valid - delete the record and return success
            await this.otpRepository.deleteByEmail(email);

            this.logger.log(`[OTP Service] SUCCESS - OTP verified for email: ${email}`);
            this.logger.log(`[OTP Service] ===== VERIFY OTP END =====`);

            return {
                success: true,
                message: 'Email verified successfully',
                data: {
                    email: email.toLowerCase(),
                    verified: true,
                },
            };
        } catch (error) {
            this.logger.error(
                `[OTP Service] EXCEPTION during OTP verification for ${email}:`,
                error
            );
            return {
                success: false,
                message: 'Failed to verify OTP. Please try again.',
            };
        }
    }

    async cleanupExpiredOTPs(): Promise<number> {
        try {
            const deletedCount = await this.otpRepository.deleteExpired();
            if (deletedCount > 0) {
                this.logger.log(
                    `Cleaned up ${deletedCount} expired OTP records`
                );
            }
            return deletedCount;
        } catch (error) {
            this.logger.error('Failed to cleanup expired OTPs:', error);
            return 0;
        }
    }

    private generateSixDigitOTP(): string {
        // Generate a random 6-digit number between 100000 and 999999
        const otp = Math.floor(100000 + Math.random() * 900000);
        return otp.toString();
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    private isValidOTP(otp: string): boolean {
        // Check if OTP is exactly 6 digits
        const otpRegex = /^\d{6}$/;
        return otpRegex.test(otp);
    }

    private async sendOTPEmail(email: string, otp: string): Promise<boolean> {
        try {
            const subject = 'Your Email Verification Code';
            this.logger.log(`[OTP Service] Attempting to send OTP email via nodemailer to: ${email}`);
            this.logger.log(`[OTP Service] SMTP Config: host=${process.env.SMTP_HOST}, port=${process.env.SMTP_PORT}, user=${process.env.SMTP_USERNAME}, APP_ENV=${process.env.APP_ENV}, EMAIL_ENABLED=${process.env.EMAIL_ENABLED}`);
            await this.nodemailerService.sendEmailWithTemplate(email, subject, 'signup_otp.hbs', { otp: otp });
            return true;
        } catch (error) {
            this.logger.error(`[OTP Service] Failed to send OTP email to ${email}: ${error.message}`);
            this.logger.error(`[OTP Service] Error stack: ${error.stack}`);
            return false;
        }
    }
}
