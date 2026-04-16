import { IsOptional, IsBoolean, IsNumber, IsString, Min, Max, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CompanySettingsRequestDto {
    // ── SMTP ──
    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    smtp_enabled?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    smtp_host?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(65535)
    smtp_port?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    smtp_username?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    smtp_password?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    smtp_from_email?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    smtp_from_name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    smtp_secure?: boolean;

    // ── SMS ──
    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    sms_enabled?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsIn(['twilio', 'vonage'])
    sms_provider?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    sms_api_key?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    sms_api_secret?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    sms_from_number?: string;

    // ── WhatsApp ──
    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    whatsapp_enabled?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsIn(['twilio', 'meta'])
    whatsapp_provider?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    whatsapp_api_key?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    whatsapp_api_secret?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    whatsapp_from_number?: string;

    // ── Code Generation ──
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsIn(['manual', 'auto'])
    location_code_mode?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    location_code_prefix?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(1)
    location_code_next_seq?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsIn(['manual', 'auto'])
    employee_code_mode?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    employee_code_prefix?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(1)
    employee_code_next_seq?: number;

    // ── Branding ──
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    logo_url?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    company_display_name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    footer_address?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    footer_contact?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    footer_extra?: string;
}
