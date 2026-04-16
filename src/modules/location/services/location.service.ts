import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { LocationRepository } from '../repository/repositories/location.repository';
import { LocationDoc } from '../repository/entities/location.entity';
import { LocationCreateRequestDto } from '../dtos/request/location.create.request.dto';
import { LocationUpdateRequestDto } from '../dtos/request/location.update.request.dto';
import { LocationGetResponseDto } from '../dtos/response/location.get.response.dto';
import { LocationListResponseDto } from '../dtos/response/location.list.response.dto';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import {
    IDatabaseCreateOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseSaveOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class LocationService {
    private readonly logger = new Logger(LocationService.name);

    constructor(
        private readonly locationRepository: LocationRepository,
        private readonly companySettingsService: CompanySettingsService,
    ) {}

    /**
     * Create a new location
     */
    async create(
        companyId: string,
        data: LocationCreateRequestDto,
        createdBy: string,
        options?: IDatabaseCreateOptions
    ): Promise<LocationDoc> {
        // Auto-generate location code if mode is 'auto' and no code provided
        let locationCode = data.location_code;
        if (!locationCode) {
            const autoCode = await this.companySettingsService.generateNextCode(companyId, 'location');
            if (autoCode) {
                locationCode = autoCode;
            } else {
                throw new BadRequestException('Location code is required');
            }
        } else {
            locationCode = locationCode.toUpperCase();
        }

        // Check if location code already exists
        const codeExists = await this.locationRepository.isLocationCodeExists(
            companyId,
            locationCode
        );

        if (codeExists) {
            throw new BadRequestException(
                `Location code '${locationCode}' already exists for this company`
            );
        }

        // If this location is being set as default, unset any existing default first
        if (data.is_default) {
            await this.locationRepository.unsetDefaultForCompany(companyId);
        }

        // Create location
        const location = await this.locationRepository.create(
            {
                ...data,
                company_id: companyId,
                created_by: createdBy,
                location_code: locationCode,
            } as any,
            options
        );

        this.logger.log(`Location created: ${location._id} for company: ${companyId}`);
        return location;
    }

    /**
     * Find all locations for a company
     */
    async findAll(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<LocationDoc[]> {
        return this.locationRepository.findByCompanyId(companyId, options);
    }

    /**
     * Find active locations for a company
     */
    async findActiveLocations(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<LocationDoc[]> {
        return this.locationRepository.findActiveByCompanyId(companyId, options);
    }

    /**
     * Find location by ID
     */
    async findOneById(
        locationId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<LocationDoc> {
        const location = await this.locationRepository.findOneById(
            locationId,
            options
        );

        if (!location) {
            throw new NotFoundException('Location not found');
        }

        return location;
    }

    /**
     * Find default location for a company
     */
    async findDefaultLocation(companyId: string): Promise<LocationDoc | null> {
        return this.locationRepository.findDefaultLocation(companyId);
    }

    /**
     * Update location
     */
    async update(
        location: LocationDoc,
        data: LocationUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<LocationDoc> {
        // If location code is being updated, check uniqueness
        if (data.location_code && data.location_code !== location.location_code) {
            const codeExists = await this.locationRepository.isLocationCodeExists(
                location.company_id.toString(),
                data.location_code,
                location._id.toString()
            );

            if (codeExists) {
                throw new BadRequestException(
                    `Location code '${data.location_code}' already exists for this company`
                );
            }

            data.location_code = data.location_code.toUpperCase();
        }

        // If setting this location as default, unset all other defaults for the company
        if (data.is_default === true) {
            await this.locationRepository.unsetDefaultForCompany(
                location.company_id.toString(),
                location._id.toString()
            );
        }

        // Update location
        Object.assign(location, data);
        const updated = await this.locationRepository.save(location, options);

        this.logger.log(`Location updated: ${location._id}`);
        return updated;
    }

    /**
     * Soft delete location
     */
    async softDelete(
        location: LocationDoc,
        options?: IDatabaseSaveOptions
    ): Promise<LocationDoc> {
        // Prevent deletion of default location
        if (location.is_default) {
            throw new BadRequestException('Cannot delete the default location');
        }

        location.soft_delete = true;
        location.is_active = false;
        const updated = await this.locationRepository.save(location, options);

        this.logger.log(`Location soft deleted: ${location._id}`);
        return updated;
    }

    /**
     * Hard delete all locations for a company (cascade delete on company removal)
     */
    async deleteAllByCompanyId(companyId: string): Promise<number> {
        return this.locationRepository.deleteAllByCompanyId(companyId);
    }

    /**
     * Count locations for a company
     */
    async countByCompanyId(companyId: string): Promise<number> {
        return this.locationRepository.countByCompanyId(companyId);
    }

    /**
     * Count active locations for a company
     */
    async countActiveByCompanyId(companyId: string): Promise<number> {
        return this.locationRepository.countActiveByCompanyId(companyId);
    }

    /**
     * Map location document to response DTO
     */
    mapGet(location: LocationDoc): LocationGetResponseDto {
        return plainToInstance(LocationGetResponseDto, location);
    }

    /**
     * Map multiple location documents to list response DTOs
     */
    mapList(locations: LocationDoc[]): LocationListResponseDto[] {
        return locations.map((location) =>
            plainToInstance(LocationListResponseDto, location)
        );
    }
}
