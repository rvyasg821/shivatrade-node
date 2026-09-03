import {
    Controller, Get, Put, Post, Delete,
    Body, Query, HttpStatus, HttpCode, UploadedFile, Logger,
} from '@nestjs/common';
import { ApiTags, ApiConsumes } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { FileUploadSingle } from '@common/file/decorators/file.decorator';
import { CompanySettingsService } from '../services/company-settings.service';
import { CompanySettingsRequestDto } from '../dtos/request/company-settings.request.dto';
import { NodemailerService, CompanySmtpConfig } from '@modules/email/services/nodemailer.service';
import { CompanyService } from '@modules/company/services/company.service';
import { UserService } from '@modules/user/services/user.service';
import { ToleranceGuardService } from '@modules/tolerance-guard/services/tolerance-guard.service';
import * as path from 'path';
import * as fs from 'fs';

@ApiTags('admin.company-settings')
@Controller({ version: '1', path: '/company-settings' })
export class CompanySettingsAdminController {
    private readonly logger = new Logger(CompanySettingsAdminController.name);
    private readonly logoUploadDir = path.resolve(process.cwd(), 'public', 'logos');

    constructor(
        private readonly settingsService: CompanySettingsService,
        private readonly nodemailerService: NodemailerService,
        private readonly companyService: CompanyService,
        private readonly userService: UserService,
        private readonly toleranceGuard: ToleranceGuardService,
    ) {
        // Ensure logo upload directory exists
        if (!fs.existsSync(this.logoUploadDir)) {
            fs.mkdirSync(this.logoUploadDir, { recursive: true });
        }
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/settings')
    async getSettings(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('locationId') locationId?: string,
    ) {
        const s = await this.settingsService.getOrCreate(companyId, locationId);
        const result: any = { statusCode: 200, message: 'Success', data: this.settingsService.mapGet(s) };

        if (locationId) {
            const companyDefaults = await this.settingsService.getCompanyDefaults(companyId);
            result.companyDefaults = this.settingsService.mapGet(companyDefaults);
        }

        return result;
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/settings')
    async updateSettings(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('locationId') locationId: string,
        @Body() body: CompanySettingsRequestDto,
    ) {
        const s = await this.settingsService.update(companyId, body as any, locationId);
        // tolerance_config is company-wide-only (always written regardless of
        // locationId — see CompanySettingsService's own doc comment), so the
        // cache always needs clearing here whenever it's part of the payload.
        if ('tolerance_config' in (body as any)) {
            await this.toleranceGuard.invalidateCache(companyId);
        }
        return { statusCode: 200, message: 'Settings updated', data: this.settingsService.mapGet(s) };
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'logo', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/logo/upload')
    async uploadLogo(
        @AuthJwtPayload('companyId') companyId: string,
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (!file) {
            return { statusCode: 400, message: 'No file provided' };
        }

        const ext = path.extname(file.originalname).toLowerCase();
        // SVG dropped (SECURITY_HARDENING_PLAN.md C3) — an SVG can embed
        // <script>/event-handler XSS, and extension-only validation can't
        // catch that. PNG/JPG/WebP are safe raster formats.
        const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
        if (!allowed.includes(ext)) {
            return { statusCode: 400, message: 'Only PNG, JPG, and WebP files are allowed' };
        }

        // Generate unique filename
        const safeName = `logo_${companyId.slice(0, 8)}_${Date.now()}${ext}`;
        const fullPath = path.join(this.logoUploadDir, safeName);

        // Delete old logo if exists
        const settings = await this.settingsService.getCompanyDefaults(companyId);
        const mapped = this.settingsService.mapGet(settings);
        if (mapped.logo_url && !mapped.logo_url.startsWith('http')) {
            try {
                const oldPath = path.resolve(process.cwd(), mapped.logo_url.replace(/^\/assets\//, 'public/'));
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            } catch (e) {
                this.logger.warn(`Failed to delete old logo: ${e.message}`);
            }
        }

        // Save new file
        fs.writeFileSync(fullPath, file.buffer);

        // Store as relative path — email service handles URL resolution
        const logoUrl = `/assets/logos/${safeName}`;

        // Update settings
        await this.settingsService.update(companyId, { logo_url: logoUrl } as any);

        return {
            statusCode: 200,
            message: 'Logo uploaded successfully',
            data: { logo_url: logoUrl },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/code-settings')
    async getCodeSettings(
        @AuthJwtPayload('companyId') companyId: string,
    ) {
        // Fetch existing employee codes to compute accurate next sequence
        let existingEmployeeCodes: string[] = [];
        try {
            const allUsers = await this.userService.findAll({ companyId }, {});
            existingEmployeeCodes = allUsers.map((u: any) => u.employee_code).filter(Boolean);
        } catch {}
        const data = await this.settingsService.getCodeSettings(companyId, existingEmployeeCodes);
        return { statusCode: 200, message: 'Success', data };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/settings')
    async deleteLocationSettings(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('locationId') locationId: string,
    ) {
        const defaults = await this.settingsService.deleteLocationOverride(companyId, locationId);
        return { statusCode: 200, message: 'Location settings reset to company defaults', data: this.settingsService.mapGet(defaults) };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/test-smtp')
    async testSmtp(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('email') adminEmail: string,
        @Body() body: {
            smtp_host: string;
            smtp_port: number;
            smtp_username: string;
            smtp_password: string;
            smtp_from_email: string;
            smtp_from_name: string;
            smtp_secure: boolean;
        },
    ) {
        // If password is masked (unchanged), decrypt from saved settings
        let smtpPassword = body.smtp_password;
        if (!smtpPassword || smtpPassword === '********') {
            const settings = await this.settingsService.getCompanyDefaults(companyId);
            const mapped = this.settingsService.mapGet(settings);
            smtpPassword = mapped.smtp_password || '';
        }

        const smtpConfig: CompanySmtpConfig = {
            smtp_enabled: true,
            smtp_host: body.smtp_host,
            smtp_port: body.smtp_port || 587,
            smtp_username: body.smtp_username,
            smtp_password: smtpPassword,
            smtp_from_email: body.smtp_from_email || body.smtp_username,
            smtp_from_name: body.smtp_from_name || 'Test',
            smtp_secure: body.smtp_secure ?? false,
        };

        try {
            await this.nodemailerService.sendEmail(
                adminEmail,
                'SMTP Test - Configuration Working',
                `This is a test email to confirm your SMTP settings are configured correctly.\n\nHost: ${smtpConfig.smtp_host}\nPort: ${smtpConfig.smtp_port}\nFrom: ${smtpConfig.smtp_from_email}\n\nIf you received this, your SMTP setup is working!`,
                undefined, // from override
                undefined, // attachments
                undefined, // html
                smtpConfig,
            );
            return { statusCode: 200, message: `Test email sent to ${adminEmail}. Check your inbox.` };
        } catch (err) {
            return { statusCode: 400, message: `SMTP test failed: ${err.message}` };
        }
    }

    // ── Setup Wizard ─────────────────────────────────────────────────────────

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/setup-status')
    async getSetupStatus(
        @AuthJwtPayload('companyId') companyId: string,
    ) {
        const company = await this.companyService.findOneById(companyId);
        return {
            statusCode: 200,
            message: 'Success',
            data: {
                setup_completed: !!(company as any)?.setup_completed,
                setup_completed_at: (company as any)?.setup_completed_at || null,
            },
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/setup-complete')
    async markSetupComplete(
        @AuthJwtPayload('companyId') companyId: string,
    ) {
        const company = await this.companyService.findOneById(companyId);
        if (!company) return { statusCode: 404, message: 'Company not found' };
        (company as any).setup_completed = true;
        (company as any).setup_completed_at = new Date();
        await this.companyService.save(company);
        return { statusCode: 200, message: 'Setup completed' };
    }
}
