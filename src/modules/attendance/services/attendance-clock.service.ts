import { Injectable, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { AttendanceRecordRepository } from '../repository/repositories/attendance-record.repository';
import { AttendanceBreakRepository } from '../repository/repositories/attendance-break.repository';
import { AttendanceSettingsService } from './attendance-settings.service';
import { FaceRecognitionService } from './face-recognition.service';
import { LocationService } from '@modules/location/services/location.service';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';
import { AttendanceRecordEntity } from '../repository/entities/attendance-record.entity';
import { AttendanceBreakEntity } from '../repository/entities/attendance-break.entity';
import {
    ENUM_ATTENDANCE_STATUS,
    ENUM_ATTENDANCE_SOURCE,
    ENUM_BREAK_TYPE,
} from '../enums/attendance.enum';
import { DateTime } from 'luxon';

@Injectable()
export class AttendanceClockService {
    private readonly logger = new Logger(AttendanceClockService.name);

    constructor(
        private readonly recordRepository: AttendanceRecordRepository,
        private readonly breakRepository: AttendanceBreakRepository,
        private readonly settingsService: AttendanceSettingsService,
        private readonly locationService: LocationService,
        private readonly faceRecognitionService: FaceRecognitionService,
        private readonly userRepository: UserRepository,
    ) {}

    /**
     * Resolve the IANA timezone: location -> company -> UTC fallback.
     */
    async getTimezone(locationId?: string, companyId?: string): Promise<string> {
        // Try location timezone first
        if (locationId) {
            try {
                const location = await this.locationService.findOneById(locationId);
                if (location?.timezone) return location.timezone;
            } catch (_) { /* fall through */ }
        }
        // Try company timezone
        if (companyId) {
            try {
                const users = await this.userRepository.findAll({ companyId }) as any[];
                // Get company from any user's companyId — or check location's company
                // Simpler: query locations for the company and use first timezone found
                const locations = await this.locationService.findAll(companyId);
                if (locations?.length) {
                    const locWithTz = locations.find((l: any) => l.timezone);
                    if (locWithTz?.timezone) return (locWithTz as any).timezone;
                }
            } catch (_) { /* fall through */ }
        }
        return 'UTC';
    }

    /**
     * Haversine formula — returns distance in meters between two lat/lng points.
     */
    private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const R = 6371000; // Earth radius in meters
        const toRad = (d: number) => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /**
     * Ensure faceDescriptor is a JSON-serialisable object (not a raw string)
     * so it can be stored in a JSONB column without error.
     */
    private normaliseFaceDescriptor(value: any): any {
        if (!value) return null;
        if (typeof value === 'string') {
            return { image: value, capturedAt: new Date().toISOString() };
        }
        return value;
    }

    /**
     * Validate face capture, face matching, and GPS/geofence based on settings.
     */
    private async validateCaptureRequirements(
        settings: any,
        userId: string,
        opts: { gps?: { lat: number; lng: number }; faceDescriptor?: any },
        locationId?: string,
    ): Promise<void> {
        // Face capture validation
        if (settings.face_capture_enabled && !opts.faceDescriptor) {
            throw new BadRequestException('Face capture is required');
        }

        // Face matching validation
        if (settings.face_capture_enabled && opts.faceDescriptor) {
            const user = await this.userRepository.findOne({ _id: userId } as any);

            if (user && (user as any).face_descriptor && Array.isArray((user as any).face_descriptor)) {
                try {
                    // Extract descriptor from the captured image (faceDescriptor is base64 string)
                    const capturedBase64 = typeof opts.faceDescriptor === 'string'
                        ? opts.faceDescriptor
                        : opts.faceDescriptor?.image;

                    if (capturedBase64 && capturedBase64.startsWith('data:image')) {
                        const capturedDescriptor = await this.faceRecognitionService.extractDescriptor(capturedBase64);
                        const storedDescriptor = (user as any).face_descriptor;
                        // Use ?? not || so an explicit 0 doesn't fall back silently.
                        // Default tightened from 0.6 → 0.5 to match the new face-recognition defaults.
                        const threshold = settings.face_match_threshold ?? 0.5;

                        if (!this.faceRecognitionService.isMatch(storedDescriptor, capturedDescriptor, threshold)) {
                            throw new BadRequestException(
                                'Face verification failed. The captured face does not match your registered face.'
                            );
                        }
                        this.logger.log(`Face verification passed for user ${userId}`);
                    }
                } catch (error) {
                    if (error instanceof BadRequestException) {
                        throw error;
                    }
                    this.logger.warn(`Face matching error for user ${userId}: ${error.message}`);
                }
            }
            // If no stored descriptor, allow (just store proof image, no matching)
        }

        // GPS validation
        if (settings.gps_enabled) {
            if (!opts.gps) {
                throw new BadRequestException('GPS location is required');
            }

            // Resolve geofence center: use attendance settings first, fall back to location's lat/lng
            let fenceLat = settings.geofence_lat;
            let fenceLng = settings.geofence_lng;
            let fenceRadius = settings.geofence_radius_meters;

            if ((!fenceLat || !fenceLng) && locationId) {
                try {
                    const location = await this.locationService.findOneById(locationId);
                    if (location?.latitude && location?.longitude) {
                        fenceLat = location.latitude;
                        fenceLng = location.longitude;
                        if (!fenceRadius) fenceRadius = 100; // default 100m radius
                    }
                } catch (_) { /* ignore */ }
            }

            // Geofence validation
            if (fenceLat && fenceLng && fenceRadius) {
                const distance = this.haversineDistance(
                    opts.gps.lat, opts.gps.lng,
                    fenceLat, fenceLng,
                );
                if (distance > fenceRadius) {
                    throw new BadRequestException(
                        `You are outside the allowed geofence area (${Math.round(distance)}m away, limit is ${fenceRadius}m)`,
                    );
                }
            }
        }
    }

    async clockIn(
        companyId: string,
        userId: string,
        locationId: string,
        opts: {
            gps?: { lat: number; lng: number };
            faceDescriptor?: any;
            source?: string;
            shiftStartTime?: string; // HH:MM for late detection
        } = {}
    ): Promise<AttendanceRecordEntity> {
        const tz = await this.getTimezone(locationId);
        const nowInTz = DateTime.now().setZone(tz);
        const today = nowInTz.toISODate(); // YYYY-MM-DD in location timezone
        const now = new Date(); // actual UTC instant for storage

        // Check for any existing record today (including soft-deleted)
        let existing = await this.recordRepository.findOne({ user_id: userId, date: today }) as AttendanceRecordEntity | null;

        // If soft-deleted, hard-delete it first so we can create fresh
        if (existing?.soft_delete) {
            await this.recordRepository.delete(existing);
            existing = null;
        }

        // If active record with clock_in exists, reject
        if (existing?.clock_in) {
            throw new ConflictException('Already clocked in today');
        }

        const settings = await this.settingsService.getOrCreate(companyId, locationId);

        // Validate face capture, face matching, and GPS/geofence
        await this.validateCaptureRequirements(settings, userId, opts, locationId);

        // Late detection — compare in location timezone
        let isLate = false;
        if (opts.shiftStartTime) {
            const [hh, mm] = opts.shiftStartTime.split(':').map(Number);
            const expectedStart = nowInTz.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
            const lateBy = nowInTz.diff(expectedStart, 'minutes').minutes;
            isLate = lateBy > settings.late_threshold_minutes;
        }

        const faceData = this.normaliseFaceDescriptor(opts.faceDescriptor);

        // Update existing record (e.g. cron-created absent/holiday without clock_in)
        if (existing) {
            return this.recordRepository.update({ _id: existing._id }, {
                clock_in: now,
                clock_in_gps: opts.gps || null,
                clock_in_face_descriptor: faceData,
                is_late: isLate,
                status: ENUM_ATTENDANCE_STATUS.PRESENT,
                source: (opts.source as any) || ENUM_ATTENDANCE_SOURCE.WEB,
                soft_delete: false,
            }) as Promise<AttendanceRecordEntity>;
        }

        // Create new record
        try {
            return await this.recordRepository.create({
                company_id: companyId,
                user_id: userId,
                location_id: locationId,
                date: today,
                clock_in: now,
                clock_in_gps: opts.gps || null,
                clock_in_face_descriptor: faceData,
                is_late: isLate,
                status: ENUM_ATTENDANCE_STATUS.PRESENT,
                source: (opts.source as any) || ENUM_ATTENDANCE_SOURCE.WEB,
                total_hours: 0,
                regular_hours: 0,
                overtime_hours: 0,
                break_minutes: 0,
                soft_delete: false,
            });
        } catch (err: any) {
            if (err?.code === '23505' || err?.driverError?.code === '23505') {
                throw new ConflictException('Already clocked in today');
            }
            throw err;
        }
    }

    async clockOut(
        companyId: string,
        userId: string,
        locationId: string,
        opts: {
            gps?: { lat: number; lng: number };
            faceDescriptor?: any;
            source?: string;
            shiftEndTime?: string; // HH:MM for early leave detection
        } = {}
    ): Promise<AttendanceRecordEntity> {
        const tz = await this.getTimezone(locationId);
        const nowInTz = DateTime.now().setZone(tz);
        const today = nowInTz.toISODate(); // YYYY-MM-DD in location timezone
        const now = new Date(); // actual UTC instant for storage

        const record = await this.recordRepository.findOne({ user_id: userId, date: today, soft_delete: false });

        if (!record || !(record as AttendanceRecordEntity).clock_in) {
            throw new BadRequestException('No active clock-in found for today');
        }
        if ((record as AttendanceRecordEntity).clock_out) {
            throw new ConflictException('Already clocked out today');
        }

        const settings = await this.settingsService.getOrCreate(companyId, (record as AttendanceRecordEntity).location_id);

        // Validate face capture, face matching, and GPS/geofence
        await this.validateCaptureRequirements(settings, userId, opts, locationId);

        const clockIn = new Date((record as AttendanceRecordEntity).clock_in);

        // Calculate hours
        const totalMs = now.getTime() - clockIn.getTime();
        const breakMs = (record as AttendanceRecordEntity).break_minutes * 60000;
        const workedMs = totalMs - breakMs;
        const totalHours = Math.max(0, workedMs / 3600000);

        let regularHours = totalHours;
        let overtimeHours = 0;
        if (settings.overtime_enabled && totalHours > settings.overtime_threshold_hours) {
            regularHours = settings.overtime_threshold_hours;
            overtimeHours = totalHours - settings.overtime_threshold_hours;
        }

        // Early leave detection — compare in location timezone
        let isEarlyLeave = false;
        if (opts.shiftEndTime) {
            const [hh, mm] = opts.shiftEndTime.split(':').map(Number);
            const expectedEnd = nowInTz.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
            const earlyBy = expectedEnd.diff(nowInTz, 'minutes').minutes;
            isEarlyLeave = earlyBy > settings.early_leave_threshold_minutes;
        }

        return this.recordRepository.update({ _id: (record as AttendanceRecordEntity)._id }, {
            clock_out: now,
            clock_out_gps: opts.gps || null,
            clock_out_face_descriptor: this.normaliseFaceDescriptor(opts.faceDescriptor),
            total_hours: Math.round(totalHours * 100) / 100,
            regular_hours: Math.round(regularHours * 100) / 100,
            overtime_hours: Math.round(overtimeHours * 100) / 100,
            is_early_leave: isEarlyLeave,
        }) as Promise<AttendanceRecordEntity>;
    }

    /**
     * Resolve the user's current attendance state for today and return the
     * list of valid next actions. Centralised so the kiosk and any other
     * client surface can stay in sync without duplicating the state machine.
     */
    async getCurrentState(
        userId: string,
        locationId?: string,
    ): Promise<{
        record: AttendanceRecordEntity | null;
        is_clocked_in: boolean;
        is_clocked_out: boolean;
        on_break: boolean;
        open_break_id: string | null;
        valid_actions: Array<'clock_in' | 'break_in' | 'break_out' | 'clock_out'>;
    }> {
        const tz = await this.getTimezone(locationId);
        const today = DateTime.now().setZone(tz).toISODate();

        const record = (await this.recordRepository.findOne({
            user_id: userId,
            date: today,
            soft_delete: false,
        })) as AttendanceRecordEntity | null;

        const result = {
            record,
            is_clocked_in: false,
            is_clocked_out: false,
            on_break: false,
            open_break_id: null as string | null,
            valid_actions: [] as Array<'clock_in' | 'break_in' | 'break_out' | 'clock_out'>,
        };

        if (!record || !record.clock_in) {
            result.valid_actions = ['clock_in'];
            return result;
        }

        result.is_clocked_in = true;

        if (record.clock_out) {
            result.is_clocked_out = true;
            // Already done for the day — no further actions in v1
            return result;
        }

        // Check for an open break
        const openBreak = (await this.breakRepository.findOne({
            attendance_id: record._id,
            end_time: null,
        })) as AttendanceBreakEntity | null;

        if (openBreak) {
            result.on_break = true;
            result.open_break_id = openBreak._id;
            result.valid_actions = ['break_out'];
            return result;
        }

        // Clocked in, not on break — can either start a break or clock out
        result.valid_actions = ['break_in', 'clock_out'];
        return result;
    }

    async startBreak(
        attendanceId: string,
        companyId: string,
        locationId: string,
        type = ENUM_BREAK_TYPE.SHORT,
    ): Promise<AttendanceBreakEntity> {
        // Check if break tracking is enabled
        const settings = await this.settingsService.getOrCreate(companyId, locationId);
        if (!settings.break_tracking_enabled) {
            throw new BadRequestException('Break tracking is not enabled');
        }

        // Check no open break
        const openBreak = await this.breakRepository.findOne({
            attendance_id: attendanceId,
            end_time: null,
        });
        if (openBreak) throw new ConflictException('A break is already in progress');

        return this.breakRepository.create({
            attendance_id: attendanceId,
            start_time: new Date(),
            type,
        });
    }

    async endBreak(
        attendanceId: string,
        companyId: string,
        locationId: string,
    ): Promise<AttendanceBreakEntity> {
        // Check if break tracking is enabled
        const settings = await this.settingsService.getOrCreate(companyId, locationId);
        if (!settings.break_tracking_enabled) {
            throw new BadRequestException('Break tracking is not enabled');
        }

        const openBreak = await this.breakRepository.findOne({
            attendance_id: attendanceId,
            end_time: null,
        });
        if (!openBreak) throw new BadRequestException('No active break found');

        const now = new Date();
        const durationMinutes = Math.round(
            (now.getTime() - new Date((openBreak as AttendanceBreakEntity).start_time).getTime()) / 60000
        );

        const updated = await this.breakRepository.update(openBreak as AttendanceBreakEntity, {
            end_time: now,
            duration_minutes: durationMinutes,
        }) as AttendanceBreakEntity;

        // Update total break_minutes on attendance record
        const record = await this.recordRepository.findOne({ _id: attendanceId });
        if (record) {
            const totalBreak = (record as AttendanceRecordEntity).break_minutes + durationMinutes;
            await this.recordRepository.update(record as AttendanceRecordEntity, { break_minutes: totalBreak });
        }

        return updated;
    }
}
