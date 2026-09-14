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
    NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { Response, ResponsePaging } from '@common/response/decorators/response.decorator';
import { IResponse, IResponsePaging } from '@common/response/interfaces/response.interface';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';

import { LocationService } from '../services/location.service';
import { LocationValidationService } from '../services/location.validation.service';
import { LocationRepository } from '../repository/repositories/location.repository';
import { LocationCreateRequestDto } from '../dtos/request/location.create.request.dto';
import { LocationUpdateRequestDto } from '../dtos/request/location.update.request.dto';
import { LocationGetResponseDto } from '../dtos/response/location.get.response.dto';
import { LocationListResponseDto } from '../dtos/response/location.list.response.dto';

@ApiTags('admin.location')
@Controller({
    version: '1',
    path: '/admin/location',
})
export class LocationAdminController {
    constructor(
        private readonly locationService: LocationService,
        private readonly locationValidationService: LocationValidationService,
        private readonly locationRepository: LocationRepository
    ) {}

    /**
     * SECURITY: `locationService.findOneById()` below resolves a location
     * purely by `_id`, with no company scoping — without this check, any
     * authenticated user of ANY company could view/edit/soft-delete another
     * company's location record just by supplying its UUID (cross-tenant
     * IDOR — found in the 2026-09-14 security review). A falsy caller
     * `companyId` means Super Admin (see `list()` above), which is exempt.
     */
    private assertLocationOwnedByCaller(
        location: any,
        callerCompanyId?: string
    ): void {
        if (
            callerCompanyId &&
            String(location?.company_id) !== String(callerCompanyId)
        ) {
            throw new NotFoundException('Location not found');
        }
    }

    /**
     * Create a new location
     */
    @Response('location.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: LocationCreateRequestDto
    ): Promise<IResponse<LocationGetResponseDto>> {
        // Validate location creation
        await this.locationValidationService.validateLocationCreation(companyId);

        // Create location
        const location = await this.locationService.create(
            companyId,
            body,
            userId
        );

        return {
            data: this.locationService.mapGet(location),
        };
    }

    /**
     * Get all locations for company
     */
    @ResponsePaging('location.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string,
        @Query('search') searchRaw?: string
    ): Promise<IResponsePaging<LocationListResponseDto>> {
        const find: any = {
            soft_delete: false,
        };

        // Add company filter only if companyId exists (not for Super Admin)
        if (companyId) {
            find.company_id = companyId;
        }

        // Add status filter if provided
        if (status === 'ACTIVE') {
            find.is_active = true;
        } else if (status === 'INACTIVE') {
            find.is_active = false;
        }

        // Add search if provided
        const searchTerm = searchRaw?.trim();
        if (searchTerm) {
            find.$or = [
                { location_name: { $regex: searchTerm, $options: 'i' } },
                { location_code: { $regex: searchTerm, $options: 'i' } },
                { city: { $regex: searchTerm, $options: 'i' } },
            ];
        }

        const locations = await this.locationRepository.findAll(find, {
            paging: {
                limit: _limit,
                offset: _offset,
            },
            order: _order,
        });

        const total = await this.locationRepository.getTotal(find);

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: this.locationService.mapList(locations),
        };
    }

    /**
     * Get location by ID
     */
    @Response('location.get')
    @AuthJwtAccessProtected()
    @Get('/get/:locationId')
    async get(
        @Param('locationId') locationId: string,
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<IResponse<LocationGetResponseDto>> {
        const location = await this.locationService.findOneById(locationId);
        this.assertLocationOwnedByCaller(location, companyId);

        return {
            data: this.locationService.mapGet(location),
        };
    }

    /**
     * Update location
     */
    @Response('location.update')
    @AuthJwtAccessProtected()
    @Put('/update/:locationId')
    async update(
        @Param('locationId') locationId: string,
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: LocationUpdateRequestDto
    ): Promise<IResponse<LocationGetResponseDto>> {
        const location = await this.locationService.findOneById(locationId);
        this.assertLocationOwnedByCaller(location, companyId);
        const updated = await this.locationService.update(location, body);

        return {
            data: this.locationService.mapGet(updated),
        };
    }

    /**
     * Delete location (soft delete)
     */
    @Response('location.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:locationId')
    async delete(
        @Param('locationId') locationId: string,
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<void> {
        const location = await this.locationService.findOneById(locationId);
        this.assertLocationOwnedByCaller(location, companyId);
        await this.locationService.softDelete(location);
    }

    /**
     * Get location capacity info
     */
    @Response('location.capacity')
    @AuthJwtAccessProtected()
    @Get('/capacity')
    async getCapacity(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('company_id') targetCompanyId?: string
    ): Promise<IResponse<{ current: number; allowed: number; remaining: number; canCreateMore: boolean; hasActiveSubscription: boolean; }>> {
        // Super Admin can pass ?company_id=xxx to check capacity for a specific company
        // Regular company admin uses their own companyId from JWT
        const resolvedCompanyId = targetCompanyId || companyId;

        // Super Admin without a target company — return unlimited
        if (!resolvedCompanyId) {
            return {
                data: { current: 0, allowed: Infinity, remaining: Infinity, canCreateMore: true, hasActiveSubscription: true },
            };
        }

        const capacity = await this.locationValidationService.getLocationCapacity(resolvedCompanyId);

        return {
            data: capacity,
        };
    }
}
