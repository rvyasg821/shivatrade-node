import { Injectable } from '@nestjs/common';
import { Repository, Not } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { LocationDoc, LocationEntity } from '../entities/location.entity';

@Injectable()
export class LocationRepository extends DatabaseObjectIdRepositoryBase<
    LocationEntity
> {
    constructor(
        @InjectDatabaseModel(LocationEntity)
        private readonly locationRepository: Repository<LocationEntity>
    ) {
        super(locationRepository);
    }

    /**
     * Find all locations for a company
     */
    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<LocationDoc[]> {
        return this.findAll(
            {
                company_id: companyId,
                soft_delete: false,
            },
            options
        );
    }

    /**
     * Find active locations for a company
     */
    async findActiveByCompanyId(
        companyId: string,
        options?: any
    ): Promise<LocationDoc[]> {
        return this.findAll(
            {
                company_id: companyId,
                is_active: true,
                soft_delete: false,
            },
            options
        );
    }

    /**
     * Find default location for a company
     */
    async findDefaultLocation(companyId: string): Promise<LocationDoc | null> {
        return this.findOne({
            company_id: companyId,
            is_default: true,
            soft_delete: false,
        });
    }

    /**
     * Count total locations for a company
     */
    async countByCompanyId(companyId: string): Promise<number> {
        return this._repository.count({
            where: {
                company_id: companyId,
                soft_delete: false,
            } as any,
        });
    }

    /**
     * Count active locations for a company
     */
    async countActiveByCompanyId(companyId: string): Promise<number> {
        return this._repository.count({
            where: {
                company_id: companyId,
                is_active: true,
                soft_delete: false,
            } as any,
        });
    }

    /**
     * Check if location code exists for a company
     */
    async isLocationCodeExists(
        companyId: string,
        locationCode: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            location_code: locationCode.toUpperCase(),
            soft_delete: false,
        };

        if (excludeId) {
            where._id = Not(excludeId);
        }

        const count = await this._repository.count({ where });
        return count > 0;
    }

    /**
     * Hard delete all locations for a company (used during company deletion)
     */
    async deleteAllByCompanyId(companyId: string): Promise<number> {
        const result = await this._repository.delete({
            company_id: companyId,
        } as any);
        return result.affected || 0;
    }

    /**
     * Unset is_default for all locations of a company, except the given locationId
     */
    async unsetDefaultForCompany(companyId: string, exceptLocationId?: string): Promise<void> {
        const where: any = {
            company_id: companyId,
            is_default: true,
            soft_delete: false,
        };
        if (exceptLocationId) {
            where._id = Not(exceptLocationId);
        }
        await this._repository.update(where, { is_default: false } as any);
    }

    /**
     * Find location by code within a company
     */
    async findByLocationCode(
        companyId: string,
        locationCode: string
    ): Promise<LocationDoc | null> {
        return this.findOne({
            company_id: companyId,
            location_code: locationCode.toUpperCase(),
            soft_delete: false,
        });
    }
}
