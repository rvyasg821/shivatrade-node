import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    HttpStatus,
    HttpCode,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { Response, ResponsePaging } from '@common/response/decorators/response.decorator';
import { IResponse, IResponsePaging } from '@common/response/interfaces/response.interface';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';

import { EmployeeService } from '../services/employee.service';
import { EmployeeValidationService } from '../services/employee.validation.service';
import { EmployeeRepository } from '../repository/repositories/employee.repository';
import { EmployeeCreateRequestDto } from '../dtos/request/employee.create.request.dto';
import { EmployeeUpdateRequestDto } from '../dtos/request/employee.update.request.dto';
import { EmployeeGetResponseDto } from '../dtos/response/employee.get.response.dto';
import { EmployeeListResponseDto } from '../dtos/response/employee.list.response.dto';
import { UserService } from '@modules/user/services/user.service';
import { RoleService } from '@modules/role/services/role.service';
import { AuthService } from '@modules/auth/services/auth.service';
import { LocationRepository } from '@modules/location/repository/repositories/location.repository';
import { ENUM_SYSTEM_ROLE, ENUM_ROLE_TYPE } from '@modules/role/enums/role.enum';
import { ENUM_USER_SIGN_UP_FROM, ENUM_USER_STATUS } from '@modules/user/enums/user.enum';
import { FaceRecognitionService } from '@modules/attendance/services/face-recognition.service';
import { FileService } from '@common/file/services/file.service';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { EnhancedEmailService } from '@modules/email/services/enhanced-email.service';
import { EmployeeLocationAssignmentRepository } from '../repository/repositories/employee-location-assignment.repository';
import { EmployeeImportExportService } from '../services/employee.import-export.service';
import { CompanyService } from '@modules/company/services/company.service';
import { FileUploadSingle } from '@common/file/decorators/file.decorator';
import { UploadedFile, Res, Req, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { SessionService } from '@modules/session/services/session.service';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import { ENUM_AUTH_LOGIN_FROM } from '@modules/auth/enums/auth.enum';
import { IAuthJwtAccessTokenPayload } from '@modules/auth/interfaces/auth.interface';
import { ApiConsumes } from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';

@ApiTags('admin.employee')
@Controller({
    version: '1',
    path: '/admin/employee',
})
export class EmployeeAdminController {
    private readonly logger = new Logger(EmployeeAdminController.name);

    constructor(
        private readonly employeeService: EmployeeService,
        private readonly employeeValidationService: EmployeeValidationService,
        private readonly employeeRepository: EmployeeRepository,
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly authService: AuthService,
        private readonly locationRepository: LocationRepository,
        private readonly faceRecognitionService: FaceRecognitionService,
        private readonly fileService: FileService,
        private readonly companySettingsService: CompanySettingsService,
        private readonly employeeLocationAssignmentRepository: EmployeeLocationAssignmentRepository,
        private readonly emailService: EnhancedEmailService,
        private readonly importExportService: EmployeeImportExportService,
        private readonly companyService: CompanyService,
        private readonly sessionService: SessionService,
        private readonly subscriptionService: SubscriptionService,
    ) {}

    // ============ IMPORT / EXPORT ============

    @AuthJwtAccessProtected()
    @Get('/sample-csv')
    @ApiOperation({ summary: 'Download sample Excel for employee import' })
    async downloadSampleTemplate(@Res() res: ExpressResponse) {
        const buffer = this.importExportService.generateSampleTemplate();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="employee-import-sample.xlsx"');
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({ summary: 'Export employees as Excel' })
    async exportExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') locationIdFromToken: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @Query('location_id') locationId?: string,
        @Res() res?: ExpressResponse,
    ) {
        let locationIds: string[] | undefined;
        if (roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            locationIds = assignedLocations?.length > 0 ? assignedLocations : (locationIdFromToken ? [locationIdFromToken] : undefined);
            if (locationId && locationIds?.includes(locationId)) locationIds = [locationId];
        } else if (locationId) {
            locationIds = [locationId];
        }

        const buffer = await this.importExportService.exportEmployees(companyId, locationIds);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="employees-${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.end(buffer);
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import')
    @ApiOperation({ summary: 'Import employees from Excel (preview or confirm)' })
    async importExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') locationIdFromToken: string,
        @UploadedFile() file: Express.Multer.File,
        @Query('preview') preview?: string,
        @Query('location_id') locationId?: string,
        @Query('send_email') sendEmail?: string,
    ) {
        if (!file) throw new BadRequestException('No file provided');

        // Use selected location from navbar (query param), fallback to JWT location for Location Admin
        const effectiveLocationId = locationId || (roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN ? locationIdFromToken : undefined);

        const { summary, rows } = await this.importExportService.parseAndValidate(file.buffer, companyId, effectiveLocationId);

        if (preview === 'true') {
            return { statusCode: 200, message: 'Preview', data: { summary, rows } };
        }

        // Confirm import — only valid rows
        const validRows = rows.filter((r) => r.status !== 'error');
        if (validRows.length === 0) {
            return { statusCode: 200, message: 'No valid rows to import', data: { summary, created: 0, updated: 0, errors: [] } };
        }

        const shouldSendEmail = sendEmail === 'true';
        const result = await this.importExportService.importEmployees(validRows, companyId, userId, shouldSendEmail);

        return {
            statusCode: 200,
            message: `Import complete: ${result.created} created, ${result.updated} updated`,
            data: { summary, ...result },
        };
    }

    // ============ CRUD ============

    /**
     * Create a new employee (user with Employee role)
     */
    @Response('employee.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    @ApiOperation({ summary: 'Create a new employee' })
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: EmployeeCreateRequestDto
    ): Promise<IResponse<any>> {
      try {
        // Only a genuinely ACTIVE user blocks creation. An inactive or
        // soft-deleted user with this email is revived + overwritten by
        // userService.create() (same recipe as the Users create flow).
        const existingUser = await this.userService.findOneByEmail(body.email);
        if (existingUser && existingUser.status === ENUM_USER_STATUS.ACTIVE) {
            throw new BadRequestException('Email already exists. Please use a different email address.');
        }

        // Get Employee role (default fallback)
        const employeeRole = await this.roleService.findOne({
            name: ENUM_SYSTEM_ROLE.EMPLOYEE,
        });

        if (!employeeRole) {
            throw new Error('Employee role not found');
        }

        // Role is required and must be a custom role for this company.
        // Throws BadRequestException if missing or not assignable.
        const resolvedRole = await this.resolveEmployeeRole(
            companyId,
            (body as any).role_id
        );

        // Use provided password or fall back to default
        const rawPassword = body.password || 'Welcome@123';
        const passwordHash = this.authService.createPassword(rawPassword);

        // Convert gender - User enum doesn't have OTHER, make it undefined
        let userGender: any = body.gender;
        if (userGender === 'OTHER') {
            userGender = undefined;
        }

        // Prepare basic user data (fields that UserCreateRequestDto accepts)
        const userData: any = {
            first_name: body.first_name,
            last_name: body.last_name,
            name: `${body.first_name}${body.last_name ? ' ' + body.last_name : ''}`,
            email: body.email,
            mobile: body.mobile,
            country_code: body.country_code,
            gender: userGender,
            role: resolvedRole._id.toString(),
            companyId: companyId,
            roleLevel: resolvedRole.level,
        };

        // Create user with Employee role
        const user = await this.userService.create(
            userData,
            passwordHash,
            ENUM_USER_SIGN_UP_FROM.ADMIN
        );

        // Extract face descriptor if face_image is provided
        let faceDescriptor: number[] | null = null;
        let faceReferencePhoto: string | null = null;
        if (body.face_image) {
            try {
                const descriptor = await this.faceRecognitionService.extractDescriptor(body.face_image);
                faceDescriptor = Array.from(descriptor);
                faceReferencePhoto = await this.fileService.uploadBase64Image(
                    body.face_image,
                    `${Date.now()}-face-ref`
                );
            } catch (error) {
                if (error instanceof BadRequestException) {
                    throw error;
                }
            }
        }

        // Auto-generate employee code if not provided
        let employeeCode = body.employee_code;
        if (!employeeCode) {
            try {
                const allUsers = await this.userService.findAll({ companyId }, {});
                const existingCodes = allUsers.map((u: any) => u.employee_code).filter(Boolean);
                const autoCode = await this.companySettingsService.generateNextCode(companyId, 'employee', existingCodes);
                if (autoCode) employeeCode = autoCode;
            } catch (e) {
                this.logger.warn(`[Employee Create] Auto-code generation failed: ${e?.message}`);
            }
        } else {
            employeeCode = employeeCode.toUpperCase();
        }

        // Apply the FULL employee payload onto the entity (shared with update),
        // then persist. The create endpoint now accepts every wizard step's
        // fields — address, salary, bank, emergency, immigration, RTW, etc.
        try {
            this.applyEmployeeFields(user, body);
            user.employee_code = employeeCode;
            if (faceDescriptor) user.face_descriptor = faceDescriptor;
            if (faceReferencePhoto) user.face_reference_photo = faceReferencePhoto;

            // userService.update saves the (now fully-populated) entity. Pass the
            // identity fields it would otherwise reset, plus the auto code +
            // primary location for proper ObjectId conversion.
            await this.userService.update(user, {
                country_code: body.country_code,
                mobile: body.mobile,
                employee_code: employeeCode,
                location_id: body.location_id,
            });
        } catch (e) {
            this.logger.warn(`[Employee Create] Persist employee fields failed: ${e?.message}`);
        }

        // Persist additional location assignments (multi-location support)
        if (Array.isArray((body as any).additional_location_ids)) {
            try {
                await this.replaceAdditionalLocations(
                    String(user._id),
                    companyId,
                    (body as any).additional_location_ids,
                    body.location_id
                );
            } catch (e: any) {
                this.logger.warn(`[Employee Create] Additional locations failed: ${e?.message}`);
            }
        }

        // Note: shared_users entry no longer needed — login authenticates directly from users table

        // Send welcome email (non-blocking)
        this.emailService.sendWelcome(
            { name: user.name, email: user.email, password: rawPassword },
            companyId,
            body.location_id,
        ).catch(() => {});

        // Refresh user data to include all updated fields
        const updatedUser = await this.userService.findOneById(String(user._id), { join: true });

        return {
            data: updatedUser || user,
        };
      } catch (err: any) {
        this.logger.error(`[Employee Create] Error: ${err?.message}`, err?.stack);
        // Handle duplicate key (email already exists)
        if (err?.code === '23505' || err?.driverError?.code === '23505') {
            const detail = err?.driverError?.detail || err?.detail || '';
            if (detail.includes('email')) {
                throw new BadRequestException('Email already exists. Please use a different email address.');
            }
            if (detail.includes('employee_code')) {
                throw new BadRequestException('Employee code already exists.');
            }
            throw new BadRequestException('A record with this data already exists.');
        }
        throw err;
      }
    }

    /**
     * Get all employees (users with Employee role) for company with pagination and filters
     */
    @ResponsePaging('employee.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    @ApiOperation({ summary: 'List all employees with pagination and filters' })
    async list(
        @AuthJwtPayload('user') userId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @AuthJwtPayload('locationId') locationIdFromToken: string,
        @AuthJwtPayload('assignedLocations') assignedLocations: string[],
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('search') searchRaw?: string,
        @Query('status') status?: string,
        @Query('location_id') locationId?: string
    ): Promise<IResponsePaging<any>> {
        // Get Employee role
        const employeeRole = await this.roleService.findOne({
            name: ENUM_SYSTEM_ROLE.EMPLOYEE,
        });

        if (!employeeRole) {
            throw new Error('Employee role not found');
        }

        // Listing role filter: include all custom roles for this company +
        // legacy Employee system role (so users created before role became
        // required still appear). Excludes Super Admin / Company Admin /
        // Location Admin / Vendor / Customer / Agent users.
        const allowedRoleIds = await this.roleService.getListableEmployeeRoleIds(
            companyId
        );

        const find: any = {
            companyId: companyId,
            role: { $in: allowedRoleIds },
        };

        // Add status filter if provided
        if (status === 'ACTIVE') {
            find.is_active = true;
        } else if (status === 'INACTIVE') {
            find.is_active = false;
        }

        // Determine the effective location filter
        this.logger.log(`[Employee List] role=${roleName}, locationIdFromToken=${locationIdFromToken}, locationIdQuery=${locationId}, assignedLocations=${JSON.stringify(assignedLocations)}`);
        let effectiveLocationId = locationId || null;
        if (roleName === ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            // Build valid locations from JWT + DB fallback
            let validLocations = assignedLocations && assignedLocations.length > 0
                ? assignedLocations
                : (locationIdFromToken ? [locationIdFromToken] : []);

            // If JWT doesn't have assignedLocations, fetch from DB
            if (!assignedLocations || assignedLocations.length === 0) {
                try {
                    const currentUser = await this.userService.findOneById(userId);
                    if (currentUser) {
                        const dbLocations = (currentUser as any).accessible_locations || [];
                        const primaryLoc = (currentUser as any).location_id ? String((currentUser as any).location_id) : null;
                        validLocations = [...new Set([
                            ...(primaryLoc ? [primaryLoc] : []),
                            ...dbLocations,
                        ])];
                    }
                } catch (e) {
                    // Fallback to JWT primary location
                }
            }

            if (locationId && validLocations.includes(locationId)) {
                effectiveLocationId = locationId;
            } else if (!locationId && validLocations.length > 0) {
                // No specific location requested — show employees from ALL assigned locations
                effectiveLocationId = null; // Will be handled below
            } else {
                effectiveLocationId = locationIdFromToken;
            }

            // If no specific location selected, filter by all assigned locations
            if (!effectiveLocationId && validLocations.length > 0) {
                find.location_id = { $in: validLocations };
            }
        }

        this.logger.log(`[Employee List] effectiveLocationId=${effectiveLocationId}`);
        if (effectiveLocationId) {
            let additionalEmployeeIds: string[] = [];
            try {
                const assignments = await this.employeeLocationAssignmentRepository.findByLocationId(effectiveLocationId);
                additionalEmployeeIds = assignments.map(a => a.employee_id);
            } catch {
                // Table may not exist yet
            }

            if (additionalEmployeeIds.length > 0) {
                // Get employees whose primary location matches
                const primaryFind: any = { ...find, location_id: effectiveLocationId };
                const primaryUsers = await this.userService.findAll(primaryFind, {});
                const primaryIds = primaryUsers.map(u => u._id.toString());

                // Combine both sets of employee IDs (deduplicated)
                const allMatchingIds = [...new Set([...primaryIds, ...additionalEmployeeIds])];
                find._id = { $in: allMatchingIds };
            } else {
                find.location_id = effectiveLocationId;
            }
        }

        // Add search if provided — use raw search string (pipe may not set _search if no availableSearch configured)
        const searchTerm = searchRaw?.trim() || (_search && typeof _search === 'string' ? _search : null);
        if (searchTerm) {
            find.$or = [
                { first_name: { $regex: searchTerm, $options: 'i' } },
                { last_name: { $regex: searchTerm, $options: 'i' } },
                { email: { $regex: searchTerm, $options: 'i' } },
                { employee_code: { $regex: searchTerm, $options: 'i' } },
                { mobile: { $regex: searchTerm, $options: 'i' } },
            ];
        }

        const users = await this.userService.findAll(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        // Get unique location IDs from users
        const locationIds = [...new Set(
            users
                .map(u => u.location_id?.toString())
                .filter(Boolean)
        )];

        // Fetch all locations using LocationRepository
        const locations = locationIds.length > 0
            ? await this.locationRepository.findAll({
                _id: { $in: locationIds },
                soft_delete: false
            })
            : [];

        // Create location map for quick lookup
        const locationMap = new Map(
            locations.map(loc => [loc._id.toString(), loc])
        );

        // Hydrate role names for the listing (so the FE Role column reads
        // role_name without an extra round-trip). Loads all roles referenced
        // by the page's users.
        const roleIds = [
            ...new Set(
                users
                    .map((u: any) => u.role?.toString?.())
                    .filter((v): v is string => !!v)
            ),
        ];
        const roleRecords = roleIds.length
            ? await this.roleService.findAll({ _id: { $in: roleIds } } as any)
            : [];
        const roleMap = new Map(
            roleRecords.map((r: any) => [r._id.toString(), r])
        );

        // Enrich users with location data
        const enrichedUsers = users.map(user => {
            const userObj: any = { ...user };

            if (userObj.location_id) {
                const locationIdStr = userObj.location_id.toString();
                const location = locationMap.get(locationIdStr);
                if (location) {
                    userObj.location_id = { ...location };
                }
            }

            const r = roleMap.get(userObj.role?.toString?.());
            if (r) {
                userObj.role_id = r._id.toString();
                userObj.role_name = (r as any).name;
            }

            return userObj;
        });

        const total = await this.userService.getTotal(find);

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: enrichedUsers,
        };
    }

    /**
     * Get employee (user) by ID
     */
    @Response('employee.get')
    @AuthJwtAccessProtected()
    @Get('/get/:employeeId')
    @ApiOperation({ summary: 'Get employee by ID' })
    async get(
        @Param('employeeId') employeeId: string
    ): Promise<IResponse<any>> {
        const user = await this.userService.findOneById(employeeId, {
            join: true,
        });

        const userObj: any = { ...user };

        // Manually fetch and attach location if location_id exists
        if (user && user.location_id) {
            const location = await this.locationRepository.findOneById(
                user.location_id.toString()
            );

            if (location) {
                userObj.location_id = { ...location };
            }
        }

        // Hydrate role on detail response. With join: true, userObj.role may
        // be either a raw string id or a populated Role doc — handle both.
        if (userObj?.role) {
            try {
                const rawRole: any = userObj.role;
                let roleId =
                    typeof rawRole === 'object'
                        ? String(rawRole._id || rawRole.id || '')
                        : String(rawRole);
                if (roleId) {
                    const r: any = await this.roleService.findOneById(roleId);
                    if (r) {
                        userObj.role_id = r._id.toString();
                        userObj.role_name = r.name;
                    } else if (typeof rawRole === 'object' && rawRole?._id) {
                        // Already populated — use it directly as fallback
                        userObj.role_id = String(rawRole._id);
                        userObj.role_name = rawRole.name;
                    }
                }
            } catch {
                // role lookup is best-effort; ignore failures
            }
        }

        // Fetch additional location assignments
        try {
            const assignments = await this.employeeLocationAssignmentRepository.findActiveByEmployeeId(employeeId);
            if (assignments.length > 0) {
                const locationIds = [...new Set(assignments.map(a => a.location_id))];
                const locations = await this.locationRepository.findAll({
                    _id: { $in: locationIds },
                    soft_delete: false,
                });
                const locationMap = new Map(locations.map(loc => [loc._id.toString(), loc]));

                userObj.additional_locations = assignments.map(a => ({
                    ...a,
                    location: locationMap.get(a.location_id) || null,
                }));
                userObj.additional_location_ids = assignments.map(a => a.location_id);
            } else {
                userObj.additional_locations = [];
                userObj.additional_location_ids = [];
            }
        } catch {
            userObj.additional_locations = [];
            userObj.additional_location_ids = [];
        }

        return {
            data: userObj,
        };
    }

    /**
     * Update employee (user)
     */
    @Response('employee.update')
    @AuthJwtAccessProtected()
    @Put('/update/:employeeId')
    @ApiOperation({ summary: 'Update employee' })
    async update(
        @Param('employeeId') employeeId: string,
        @Body() body: EmployeeUpdateRequestDto
    ): Promise<IResponse<any>> {
        const user = await this.userService.findOneById(employeeId);

        // Convert gender - User enum doesn't have OTHER, make it undefined
        let userGender = body.gender;
        if (userGender === 'OTHER') {
            userGender = undefined;
        }

        // Extract face descriptor if face_image is provided
        if (body.face_image) {
            try {
                const descriptor = await this.faceRecognitionService.extractDescriptor(body.face_image);
                user.face_descriptor = Array.from(descriptor) as any;
                user.face_reference_photo = await this.fileService.uploadBase64Image(
                    body.face_image,
                    `${Date.now()}-face-ref`
                );
            } catch (error) {
                if (error instanceof BadRequestException) {
                    throw error;
                }
            }
        }

        // Map employee DTO fields to user update data
        const updateData: any = {
            first_name: body.first_name,
            last_name: body.last_name,
            email: body.email,
            mobile: body.mobile,
            country_code: body.country_code,
            gender: userGender,
            // Only include password if provided (userService.update handles hashing)
            ...(body.password ? { password: body.password } : {}),
        };

        // Active flag drives the user status (update-only side-effect).
        if (body.is_active !== undefined) {
            updateData.status = body.is_active ? ENUM_USER_STATUS.ACTIVE : ENUM_USER_STATUS.INACTIVE;
        }

        // Apply every employee-specific field from the body onto the entity
        // (shared with create so both persist the full payload).
        this.applyEmployeeFields(user, body);

        // Update basic fields using service (whitelist path)
        const updated = await this.userService.update(user, updateData);

        // Role re-assignment. Only validate/re-assign when the role actually
        // CHANGES — saving the form without touching the role must not require
        // the already-assigned role to still be in the "assignable" list
        // (otherwise every save fails with "Role is not assignable").
        const newRoleId = (body as any).role_id
            ? String((body as any).role_id)
            : '';
        // Current role may be a raw string id or a populated role doc.
        const rawRole: any = (user as any).role;
        const currentRoleId = rawRole
            ? typeof rawRole === 'object'
                ? String(rawRole._id || rawRole.id || '')
                : String(rawRole)
            : '';
        if (newRoleId && newRoleId !== currentRoleId) {
            const companyId = String(
                (user as any).company_id || (user as any).companyId || ''
            );
            const resolved = await this.resolveEmployeeRole(
                companyId,
                newRoleId
            );
            user.role = resolved._id.toString();
            (user as any).roleLevel = resolved.level;
            await this.userService.update(user, {
                role: resolved._id.toString(),
                roleLevel: resolved.level,
            } as any);
        }

        // Replace-on-update additional locations (excludes primary location_id).
        if (Array.isArray((body as any).additional_location_ids)) {
            await this.replaceAdditionalLocations(
                String(user._id),
                String((user as any).company_id || (user as any).companyId || ''),
                (body as any).additional_location_ids,
                String(user.location_id || '')
            );
        }

        return {
            data: updated,
        };
    }

    /**
     * Validates the requested role_id is an assignable custom role for this
     * company. Throws when missing or not allowed.
     */
    private async resolveEmployeeRole(
        companyId: string,
        requestedRoleId: string | undefined
    ): Promise<any> {
        if (!requestedRoleId) {
            throw new BadRequestException('Role is required for employees');
        }
        const allowedIds = await this.roleService.getAssignableEmployeeRoleIds(
            companyId
        );
        if (!allowedIds.includes(requestedRoleId)) {
            throw new BadRequestException(
                'Role is not assignable. Pick a custom role created for this company.'
            );
        }
        const role = await this.roleService.findOneById(requestedRoleId);
        if (!role) {
            throw new BadRequestException('Role not found');
        }
        return role;
    }

    /**
     * Applies every employee-specific field present in the request body onto
     * the user entity (mutates `user`). Shared by create + update so both
     * persist the FULL payload (basic, address, salary, bank, kin/emergency,
     * immigration, RTW, reporting). Only fields present in the body are touched;
     * the caller is responsible for saving the entity afterwards.
     */
    private applyEmployeeFields(user: any, body: any): void {
        // ── Job / basic ──
        if (body.employee_code !== undefined) user.employee_code = body.employee_code;
        if (body.designation !== undefined) user.designation = body.designation;
        if (body.department !== undefined) user.department = body.department;
        if (body.employment_type !== undefined) {
            user.employment_type = (body.employment_type && body.employment_type.trim()) ? body.employment_type : null;
        }
        if (body.date_of_joining !== undefined) user.date_of_joining = body.date_of_joining;
        if (body.date_of_birth !== undefined) user.date_of_birth = body.date_of_birth;
        if (body.is_active !== undefined) user.is_active = body.is_active;
        if (body.location_id !== undefined) {
            user.location_id = body.location_id;
            user.locationId = body.location_id;
        }

        // ── Address ──
        if (body.address_1 !== undefined) user.address_line1 = body.address_1;
        if (body.address_2 !== undefined) user.address_line2 = body.address_2;
        if (body.city !== undefined) user.city = body.city;
        if (body.state !== undefined) user.state = body.state;
        if (body.country !== undefined) user.country = body.country;
        if (body.zip_code !== undefined) user.postcode = body.zip_code;

        // ── Extended personal ──
        if (body.middle_name !== undefined) user.middle_name = body.middle_name;
        if (body.marital_status !== undefined) user.marital_status = body.marital_status;
        if (body.home_telephone !== undefined) user.home_telephone = body.home_telephone;
        if (body.ni_number !== undefined) user.ni_number = body.ni_number;
        if (body.nationality !== undefined) user.nationality = body.nationality;

        // ── Salary & working hours ──
        if (body.working_hours_pattern !== undefined) user.working_hours_pattern = body.working_hours_pattern;
        if (body.payroll_frequency !== undefined) user.payroll_frequency = body.payroll_frequency;
        if (body.mode_of_transfer !== undefined) user.mode_of_transfer = body.mode_of_transfer;
        if (body.sick_leaves_allowed !== undefined) user.sick_leaves_allowed = body.sick_leaves_allowed;
        if (body.annual_leaves_allowed !== undefined) user.annual_leaves_allowed = body.annual_leaves_allowed;
        if (body.annual_salary !== undefined) user.annual_salary = body.annual_salary === null ? null : Number(body.annual_salary);
        if (body.hourly_rate !== undefined) user.hourly_rate = body.hourly_rate === null ? null : Number(body.hourly_rate);
        if (body.weekly_working_hours !== undefined) user.weekly_working_hours = body.weekly_working_hours === null ? null : Number(body.weekly_working_hours);
        if (body.pay_type !== undefined) user.pay_type = body.pay_type;

        // ── Bank / financial ──
        if (body.bank_name !== undefined) user.bank_name = body.bank_name;
        if (body.account_holder_name !== undefined) user.account_holder_name = body.account_holder_name;
        if (body.sort_code !== undefined) user.sort_code = body.sort_code;
        if (body.account_number !== undefined) user.account_number = body.account_number;
        if (body.pension_opt_in !== undefined) user.pension_opt_in = body.pension_opt_in;
        if (body.pension_provider !== undefined) user.pension_provider = body.pension_provider;
        if (body.pension_employee_contribution !== undefined) user.pension_employee_contribution = body.pension_employee_contribution;
        if (body.pension_employer_contribution !== undefined) user.pension_employer_contribution = body.pension_employer_contribution;
        if (body.tax_code !== undefined) user.tax_code = body.tax_code;
        if (body.ni_category !== undefined) user.ni_category = body.ni_category;

        // ── Next of kin / emergency ──
        if (body.kin_name !== undefined) user.kin_name = body.kin_name;
        if (body.kin_relationship !== undefined) user.kin_relationship = body.kin_relationship;
        if (body.kin_address !== undefined) user.kin_address = body.kin_address;
        if (body.kin_postcode !== undefined) user.kin_postcode = body.kin_postcode;
        if (body.kin_phone !== undefined) user.kin_phone = body.kin_phone;
        if (body.kin_email !== undefined) user.kin_email = body.kin_email;

        // ── Immigration / passport ──
        if (body.passport_number !== undefined) user.passport_number = body.passport_number;
        if (body.passport_country_of_issue !== undefined) user.passport_country_of_issue = body.passport_country_of_issue;
        if (body.passport_expiry !== undefined) user.passport_expiry = body.passport_expiry;
        if (body.visa_category !== undefined) user.visa_category = body.visa_category;
        if (body.visa_valid_from !== undefined) user.visa_valid_from = body.visa_valid_from;
        if (body.visa_valid_to !== undefined) user.visa_valid_to = body.visa_valid_to;
        if (body.brp_number !== undefined) user.brp_number = body.brp_number;
        if (body.cos_number !== undefined) user.cos_number = body.cos_number;
        if (body.visa_restriction !== undefined) user.visa_restriction = body.visa_restriction;
        if (body.share_code !== undefined) user.share_code = body.share_code;

        // ── Right to work ──
        if (body.rtw_check_date !== undefined) user.rtw_check_date = body.rtw_check_date;
        if (body.rtw_end_date !== undefined) user.rtw_end_date = body.rtw_end_date;
        if (body.rtw_check_conducted !== undefined) user.rtw_check_conducted = body.rtw_check_conducted;
        if (body.rtw_date_received !== undefined) user.rtw_date_received = body.rtw_date_received;
        if (body.ecs_expiry_date !== undefined) user.ecs_expiry_date = body.ecs_expiry_date;

        // ── Reporting ──
        if (body.reporting_to !== undefined) user.reporting_to = body.reporting_to;
    }

    /**
     * Soft-deletes existing employee_location_assignments rows for this employee
     * and inserts new ones from the incoming list. The employee's primary
     * `location_id` is excluded from the assignment list (it's stored on the
     * user row, not the junction). Duplicates and empties are silently dropped.
     */
    private async replaceAdditionalLocations(
        employeeId: string,
        companyId: string,
        locationIds: string[],
        primaryLocationId: string
    ): Promise<void> {
        const incoming = Array.from(
            new Set(
                (locationIds || [])
                    .filter((v): v is string => !!v)
                    .filter((v) => v !== primaryLocationId)
            )
        );

        // Hard-delete EVERY existing row for this employee — including any
        // already soft-deleted ones. The table has a unique index on
        // (employee_id, location_id) that does NOT exclude soft-deleted rows,
        // so soft-deleting + re-inserting the same pair violates that index
        // (duplicate key 23505). This is a pure mapping table — the inline
        // remove endpoint also hard-deletes — so a clean replace is correct.
        await this.employeeLocationAssignmentRepository.deleteMany(
            { employee_id: employeeId },
            { withDeleted: true }
        );

        for (const locationId of incoming) {
            await this.employeeLocationAssignmentRepository.create({
                company_id: companyId,
                employee_id: employeeId,
                location_id: locationId,
                is_active: true,
            } as any);
        }
    }

    /**
     * Delete employee (user) - soft delete
     */
    @Response('employee.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:employeeId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Soft delete employee' })
    async delete(
        @Param('employeeId') employeeId: string
    ): Promise<void> {
        const user = await this.userService.findOneById(employeeId);

        // Append deletion suffix to email and employee_code to free unique constraints
        const suffix = `_deleted_${Date.now()}`;
        if (user.email) user.email = `${user.email}${suffix}`;
        if ((user as any).employee_code) (user as any).employee_code = `${(user as any).employee_code}${suffix}`;
        (user as any).is_active = false;

        await this.userService.softDelete(user);
    }

    /**
     * Check if email exists in users or shared_users tables
     */
    @Response('employee.checkEmail')
    @AuthJwtAccessProtected()
    @Post('/check-email')
    @ApiOperation({ summary: 'Check if email already exists' })
    async checkEmail(
        @AuthJwtPayload('companyId') companyId: string,
        @Body('email') email: string,
        @Body('exclude_id') excludeId?: string,
        @Body('employeeId') employeeId?: string
    ): Promise<IResponse<{ exists: boolean }>> {
        // If editing an employee, get their current email to allow keeping the same email
        let currentEmail: string | null = null;
        if (excludeId || employeeId) {
            const currentUser = await this.userService.findOneById(
                excludeId || employeeId
            );
            if (currentUser) {
                currentEmail = currentUser.email;
            }
        }

        // If the email is the same as the current user's email, it's allowed
        if (currentEmail && email.toLowerCase() === currentEmail.toLowerCase()) {
            return {
                data: { exists: false },
            };
        }

        // Check if email exists in users table (excluding soft-deleted)
        const existingUser = await this.userService.findOneByEmail(email);
        if (existingUser && !(existingUser as any).deleted) {
            return {
                data: { exists: true },
            };
        }

        return {
            data: { exists: false },
        };
    }

    /**
     * Check if employee code exists in users table
     */
    @Response('employee.checkCode')
    @AuthJwtAccessProtected()
    @Post('/check-code')
    @ApiOperation({ summary: 'Check if employee code already exists' })
    async checkCode(
        @AuthJwtPayload('companyId') companyId: string,
        @Body('employee_code') employeeCode: string,
        @Body('exclude_id') excludeId?: string,
        @Body('employeeId') employeeId?: string
    ): Promise<IResponse<{ exists: boolean }>> {
        const query: any = {
            companyId: companyId,
            employee_code: employeeCode.toUpperCase(),
        };

        // Exclude current employee if editing
        if (excludeId || employeeId) {
            query._id = { $ne: excludeId || employeeId };
        }

        const user = await this.userService.findOne(query);

        return {
            data: { exists: !!user },
        };
    }

    /**
     * Get employee capacity info
     */
    @Response('employee.capacity')
    @AuthJwtAccessProtected()
    @Get('/capacity')
    @ApiOperation({ summary: 'Get employee capacity information' })
    async getCapacity(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<IResponse<{ current: number; allowed: number; remaining: number; canCreateMore: boolean; }>> {
        const capacity = await this.employeeValidationService.getEmployeeCapacity(companyId);

        return {
            data: capacity,
        };
    }

    /**
     * Get additional location assignments for an employee
     */
    @Response('employee.locationAssignments')
    @AuthJwtAccessProtected()
    @Get('/location-assignments/:employeeId')
    @ApiOperation({ summary: 'Get location assignments for an employee' })
    async getLocationAssignments(
        @Param('employeeId') employeeId: string
    ): Promise<IResponse<any>> {
        const assignments = await this.employeeLocationAssignmentRepository.findByEmployeeId(employeeId);

        // Enrich with location details
        const locationIds = [...new Set(assignments.map(a => a.location_id))];
        const locations = locationIds.length > 0
            ? await this.locationRepository.findAll({ _id: { $in: locationIds }, soft_delete: false })
            : [];
        const locationMap = new Map(locations.map(loc => [loc._id.toString(), loc]));

        const enriched = assignments.map(a => ({
            ...a,
            location: locationMap.get(a.location_id) || null,
        }));

        return { data: enriched };
    }

    /**
     * Add additional location assignment for an employee
     */
    @Response('employee.addLocationAssignment')
    @AuthJwtAccessProtected()
    @Post('/location-assignments/:employeeId')
    @ApiOperation({ summary: 'Add location assignment for an employee' })
    async addLocationAssignment(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('employeeId') employeeId: string,
        @Body() body: { location_id: string; start_date?: string; end_date?: string }
    ): Promise<IResponse<any>> {
        // Verify the employee exists
        await this.userService.findOneById(employeeId);

        // Check if assignment already exists
        const existing = await this.employeeLocationAssignmentRepository.findOne({
            employee_id: employeeId,
            location_id: body.location_id,
            deleted: false,
        });

        if (existing) {
            throw new BadRequestException('Employee is already assigned to this location');
        }

        const assignment = await this.employeeLocationAssignmentRepository.create({
            company_id: companyId,
            employee_id: employeeId,
            location_id: body.location_id,
            start_date: body.start_date ? new Date(body.start_date) : undefined,
            end_date: body.end_date ? new Date(body.end_date) : undefined,
            is_active: true,
        });

        return { data: assignment };
    }

    /**
     * Remove a location assignment
     */
    @Response('employee.removeLocationAssignment')
    @AuthJwtAccessProtected()
    @Delete('/location-assignments/:assignmentId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Remove a location assignment' })
    async removeLocationAssignment(
        @Param('assignmentId') assignmentId: string
    ): Promise<IResponse<any>> {
        const assignment = await this.employeeLocationAssignmentRepository.findOneById(assignmentId);

        if (!assignment) {
            throw new BadRequestException('Assignment not found');
        }

        await this.employeeLocationAssignmentRepository.softDelete(assignment);

        return { data: { _id: assignmentId } };
    }

    /**
     * Update a location assignment (toggle active, update dates)
     */
    @Response('employee.updateLocationAssignment')
    @AuthJwtAccessProtected()
    @Put('/location-assignments/:assignmentId')
    @ApiOperation({ summary: 'Update a location assignment' })
    async updateLocationAssignment(
        @Param('assignmentId') assignmentId: string,
        @Body() body: { is_active?: boolean; start_date?: string; end_date?: string }
    ): Promise<IResponse<any>> {
        const assignment = await this.employeeLocationAssignmentRepository.findOneById(assignmentId);

        if (!assignment) {
            throw new BadRequestException('Assignment not found');
        }

        const updateData: any = {};
        if (body.is_active !== undefined) updateData.is_active = body.is_active;
        if (body.start_date !== undefined) updateData.start_date = body.start_date ? new Date(body.start_date) : null;
        if (body.end_date !== undefined) updateData.end_date = body.end_date ? new Date(body.end_date) : null;

        const updated = await this.employeeLocationAssignmentRepository.update(assignment, updateData);

        return { data: updated };
    }

    // ── Impersonate Employee ─────────────────────────────────────────────────

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/impersonate/:employeeId')
    @ApiOperation({ summary: 'Login as employee (Company Admin / Location Admin only)' })
    async impersonateEmployee(
        @Param('employeeId') employeeId: string,
        @AuthJwtPayload('user') adminUserId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('roleName') roleName: string,
        @Req() request: Request,
    ) {
        // Only Company Admin or Location Admin can impersonate
        if (roleName !== ENUM_SYSTEM_ROLE.COMPANY_ADMIN && roleName !== ENUM_SYSTEM_ROLE.LOCATION_ADMIN) {
            throw new ForbiddenException({ message: 'Only Company Admin or Location Admin can login as employee' });
        }

        const employee = await this.userService.findOneById(employeeId, { join: true });
        if (!employee) throw new BadRequestException({ message: 'Employee not found' });
        if (employee.companyId !== companyId) throw new ForbiddenException({ message: 'Cannot impersonate employee from another company' });

        // Guard: only allow impersonating users that belong to the Employee
        // module (custom roles + legacy Employee role). Blocks impersonation
        // of Company Admin / Location Admin / Vendor / Customer / Agent.
        {
            const allowedRoleIds = await this.roleService.getListableEmployeeRoleIds(
                companyId
            );
            // user.role can be either a string id (raw) or a populated Role
            // doc (when fetched with join: true). Handle both.
            const rawRole: any = (employee as any).role;
            const targetRoleId = rawRole && typeof rawRole === 'object'
                ? String(rawRole._id || rawRole.id || '')
                : (rawRole ? String(rawRole) : '');
            if (!targetRoleId || !allowedRoleIds.includes(targetRoleId)) {
                throw new ForbiddenException({
                    message: 'This user cannot be impersonated from the Employee module',
                });
            }
        }

        // Create session
        const session = await this.sessionService.create(request, { user: String(employee._id) });

        // Build tokens
        const loginDate = new Date();
        const payloadAccessToken: IAuthJwtAccessTokenPayload = await this.authService.createPayloadAccessToken(
            employee as any, session._id.toString(), loginDate, ENUM_AUTH_LOGIN_FROM.CREDENTIAL,
        );
        (payloadAccessToken as any).impersonatedBy = adminUserId;

        const accessToken = this.authService.createAccessToken(String(employee._id), payloadAccessToken);
        const payloadRefreshToken = this.authService.createPayloadRefreshToken(payloadAccessToken);
        const refreshToken = this.authService.createRefreshToken(String(employee._id), payloadRefreshToken);

        // Get tools from subscription
        let tools = [];
        try {
            const company = await this.companyService.findOneById(companyId);
            const subscriptionUserId = company?.user_id ? String(company.user_id) : adminUserId;
            const subscription = await this.subscriptionService.findActiveByUserId(subscriptionUserId);
            if (subscription?.tools) tools = subscription.tools;
        } catch {}

        const company = await this.companyService.findOneById(companyId);
        const employeeName = [employee.first_name, employee.last_name].filter(Boolean).join(' ') || employee.name;

        this.logger.log(`${roleName} ${adminUserId} impersonating Employee ${employee._id} (${employeeName})`);

        return {
            statusCode: 200,
            message: 'Success',
            data: {
                accessToken,
                refreshToken,
                userData: employee,
                companyId: String(companyId),
                companyName: company?.company_name || '',
                employeeName,
                companyData: {
                    _id: String(companyId),
                    company_name: company?.company_name || '',
                    tools,
                },
            },
        };
    }
}
