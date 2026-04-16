import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { SettingFeatureEntity } from '@modules/setting/repository/entities/setting-feature.entity';
import { SettingFeatureService } from '@modules/setting/services/setting-feature.service';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class MigrationSettingFeatureSeed {
    constructor(
        private readonly settingFeatureService: SettingFeatureService,
        private readonly configService: ConfigService
    ) { }

    @Command({
        command: 'seed:settings',
        describe: 'seed settings',
    })
    async seeds(): Promise<void> {
        try {
            const emailSetting = new SettingFeatureEntity();
            emailSetting.key = 'smtp.email';
            emailSetting.description = 'Setting for email service';
            emailSetting.value = {
                enabled: true,
                smtp_email: this.configService.get('SMTP_EMAIL') || 'your-email@gmail.com',
                smtp_password: this.configService.get('SMTP_PASSWORD') || 'your_email_password',
                smtp_host: this.configService.get('SMTP_HOST') || 'smtp.gmail.com',
                smtp_port: this.configService.get('SMTP_PORT') || 587,
                smtp_service: this.configService.get('SMTP_SERVICE') || 'gmail',
                smtp_secure: this.configService.get('SMTP_SECURE') && this.configService.get('SMTP_SECURE') === 'true' ? true : false,
            };

            // Create multiple config entities at once
            await this.settingFeatureService.createMany([
                emailSetting,
            ]);
        } catch (err: any) {
            throw new Error(err);
        }

        return;
    }

    @Command({
        command: 'remove:settings',
        describe: 'remove settings',
    })
    async remove(): Promise<void> {
        try {
            await this.settingFeatureService.deleteMany();
        } catch (err: any) {
            throw new Error(err);
        }

        return;
    }
}
