import { Injectable, BadRequestException } from '@nestjs/common';
import {
    IDatabaseCreateOptions,
    IDatabaseExistsOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseUpdateOptions,
} from '@common/database/interfaces/database.interface';
import { ISharedUserService } from '@modules/shared-users/interfaces/shared-user.service.interface';
import { SharedUserRepository } from '@modules/shared-users/repository/repositories/shared-user.repository';
import {
    SharedUserDoc,
    SharedUserEntity,
    ENUM_SHARED_USER_TYPE,
} from '@modules/shared-users/repository/entities/shared-user.entity';

@Injectable()
export class SharedUserService implements ISharedUserService {
    constructor(
        private readonly sharedUserRepository: SharedUserRepository
    ) {}

    async findByEmail(
        email: string,
        options?: IDatabaseFindOneOptions
    ): Promise<SharedUserDoc | null> {
        return this.sharedUserRepository.findByEmail(email);
    }

    async findByEmailAndUserType(
        email: string,
        userType: ENUM_SHARED_USER_TYPE,
        options?: IDatabaseFindOneOptions
    ): Promise<SharedUserDoc | null> {
        return this.sharedUserRepository.findByEmailAndUserType(email, userType);
    }

    async findByTenantId(
        tenantId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<SharedUserDoc[]> {
        return this.sharedUserRepository.findByTenantId(tenantId);
    }

    async findByUserType(
        userType: ENUM_SHARED_USER_TYPE,
        options?: IDatabaseFindAllOptions
    ): Promise<SharedUserDoc[]> {
        return this.sharedUserRepository.findByUserType(userType);
    }

    async existsByEmail(
        email: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean> {
        return this.sharedUserRepository.existsByEmail(email);
    }

    async create(
        data: Partial<SharedUserEntity>,
        options?: IDatabaseCreateOptions
    ): Promise<SharedUserDoc> {
        // Validate required fields
        if (!data.email || !data.password || !data.userType) {
            throw new BadRequestException('Email, password, and userType are required');
        }

        // Validate email uniqueness
        const existingUser = await this.existsByEmail(data.email);
        if (existingUser) {
            throw new BadRequestException(`User with email ${data.email} already exists`);
        }

        // Validate userType
        if (!Object.values(ENUM_SHARED_USER_TYPE).includes(data.userType)) {
            throw new BadRequestException(`Invalid userType: ${data.userType}`);
        }

        // Multi-tenant removed - tenantId validation removed
        // All users now work without tenantId requirement

        return this.sharedUserRepository.create(data as SharedUserEntity, options);
    }

    async updateByEmail(
        email: string,
        updateData: Partial<SharedUserEntity>,
        options?: IDatabaseUpdateOptions
    ): Promise<SharedUserDoc | null> {
        // Validate userType if being updated
        if (updateData?.userType && !Object.values(ENUM_SHARED_USER_TYPE).includes(updateData.userType)) {
            throw new BadRequestException(`Invalid userType: ${updateData.userType}`);
        }

        // Multi-tenant removed - tenantId validation removed
        // All users now work without tenantId requirement

        return this.sharedUserRepository.updateByEmail(email, updateData);
    }

    async deleteByEmail(email: string): Promise<boolean> {
        return this.sharedUserRepository.deleteByEmail(email);
    }

    async getTotal(options?: IDatabaseGetTotalOptions): Promise<number> {
        return this.sharedUserRepository.getTotal(options);
    }

    async existsByEmailExceptOriginalUserId(
        email: string,
        originalUserId?: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean> {
        // Validate email format
        if (!email || typeof email !== 'string' || email.trim().length === 0) {
            throw new BadRequestException('Valid email is required');
        }

        // Validate originalUserId format if provided
        if (originalUserId && typeof originalUserId !== 'string') {
            throw new BadRequestException('originalUserId must be a valid string');
        }

        return this.sharedUserRepository.existsByEmailExceptOriginalUserId(email.trim(), originalUserId);
    }

    async deleteByTenantId(tenantId: string): Promise<number> {
        if (!tenantId || typeof tenantId !== 'string') {
            throw new BadRequestException('Valid tenantId is required');
        }
        return this.sharedUserRepository.deleteByTenantId(tenantId);
    }

    async deleteByEmails(emails: string[]): Promise<number> {
        return this.sharedUserRepository.deleteByEmails(emails);
    }

    async deleteByCompanyId(companyId: string): Promise<number> {
        if (!companyId || typeof companyId !== 'string') {
            throw new BadRequestException('Valid companyId is required');
        }
        return this.sharedUserRepository.deleteByCompanyId(companyId);
    }
}