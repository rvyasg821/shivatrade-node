import { Injectable } from '@nestjs/common';
import { AttendanceSettingsRepository } from '../repository/repositories/attendance-settings.repository';
import { AttendanceSettingsEntity } from '../repository/entities/attendance-settings.entity';

const HARDCODED_DEFAULTS: Partial<AttendanceSettingsEntity> = {
    face_capture_enabled: false,
    gps_enabled: false,
    auto_clock_out_enabled: false,
    break_tracking_enabled: false,
    overtime_enabled: false,
    overtime_threshold_hours: 8,
    overtime_multiplier: 1.5,
    late_threshold_minutes: 15,
    early_leave_threshold_minutes: 15,
};

@Injectable()
export class AttendanceSettingsService {
    constructor(private readonly settingsRepository: AttendanceSettingsRepository) {}

    /**
     * Get or create company-wide defaults (location_id = NULL row).
     */
    async getCompanyDefaults(companyId: string): Promise<AttendanceSettingsEntity> {
        let settings = await this.settingsRepository.findOne({ company_id: companyId, location_id: null as any });
        if (!settings) {
            settings = await this.settingsRepository.create({
                company_id: companyId,
                location_id: null,
                ...HARDCODED_DEFAULTS,
            });
        }
        return settings as AttendanceSettingsEntity;
    }

    /**
     * Get settings for a company+location.
     * - No locationId → returns company defaults, is_inherited = false
     * - locationId provided + location row exists → returns it, is_inherited = false
     * - locationId provided + no location row → returns company defaults, is_inherited = true
     */
    async getOrCreate(companyId: string, locationId?: string): Promise<AttendanceSettingsEntity & { is_inherited?: boolean }> {
        if (!locationId) {
            const defaults = await this.getCompanyDefaults(companyId);
            (defaults as any).is_inherited = false;
            return defaults as AttendanceSettingsEntity & { is_inherited: boolean };
        }

        // Look for location-specific row
        const locationSettings = await this.settingsRepository.findOne({ company_id: companyId, location_id: locationId });
        if (locationSettings) {
            (locationSettings as any).is_inherited = false;
            return locationSettings as AttendanceSettingsEntity & { is_inherited: boolean };
        }

        // No location row — fall back to company defaults
        const defaults = await this.getCompanyDefaults(companyId);
        (defaults as any).is_inherited = true;
        return defaults as AttendanceSettingsEntity & { is_inherited: boolean };
    }

    /**
     * Update settings. When locationId is provided, always create/update the location-specific row.
     */
    async update(companyId: string, data: Partial<AttendanceSettingsEntity>, locationId?: string): Promise<AttendanceSettingsEntity> {
        if (!locationId) {
            // Update company defaults
            const defaults = await this.getCompanyDefaults(companyId);
            return this.settingsRepository.update(defaults, data) as Promise<AttendanceSettingsEntity>;
        }

        // For location: find or create the location-specific row
        let locationSettings = await this.settingsRepository.findOne({ company_id: companyId, location_id: locationId });
        if (locationSettings) {
            return this.settingsRepository.update(locationSettings, data) as Promise<AttendanceSettingsEntity>;
        }

        // Create new location-specific row with the provided data
        return this.settingsRepository.create({
            company_id: companyId,
            location_id: locationId,
            ...HARDCODED_DEFAULTS,
            ...data,
        }) as Promise<AttendanceSettingsEntity>;
    }

    /**
     * Delete location-specific override so it falls back to company defaults.
     */
    async deleteLocationOverride(companyId: string, locationId: string): Promise<AttendanceSettingsEntity> {
        const locationSettings = await this.settingsRepository.findOne({ company_id: companyId, location_id: locationId });
        if (locationSettings) {
            await this.settingsRepository.delete(locationSettings);
        }
        // Return company defaults
        return this.getCompanyDefaults(companyId);
    }

    mapGet(s: AttendanceSettingsEntity & { is_inherited?: boolean }) {
        return {
            _id: s._id,
            company_id: s.company_id,
            location_id: s.location_id,
            face_capture_enabled: s.face_capture_enabled,
            gps_enabled: s.gps_enabled,
            geofence_radius_meters: s.geofence_radius_meters,
            geofence_lat: s.geofence_lat,
            geofence_lng: s.geofence_lng,
            auto_clock_out_enabled: s.auto_clock_out_enabled,
            auto_clock_out_time: s.auto_clock_out_time,
            break_tracking_enabled: s.break_tracking_enabled,
            overtime_enabled: s.overtime_enabled,
            overtime_threshold_hours: s.overtime_threshold_hours,
            overtime_multiplier: s.overtime_multiplier,
            late_threshold_minutes: s.late_threshold_minutes,
            early_leave_threshold_minutes: s.early_leave_threshold_minutes,
            is_inherited: !!(s as any).is_inherited,
        };
    }
}
