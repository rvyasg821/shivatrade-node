import { Injectable } from '@nestjs/common';
import { Repository, In, Not } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import {
    SharedUserEntity,
    ENUM_SHARED_USER_TYPE,
} from '@modules/shared-users/repository/entities/shared-user.entity';

@Injectable()
export class SharedUserRepository extends DatabaseObjectIdRepositoryBase<
    SharedUserEntity
> {
    constructor(
        @InjectDatabaseModel(SharedUserEntity)
        private readonly sharedUserRepository: Repository<SharedUserEntity>
    ) {
        super(sharedUserRepository);
    }

    async findByEmail(email: string): Promise<SharedUserEntity | null> {
        return this.sharedUserRepository.findOne({
            where: { email: email.toLowerCase() } as any,
            select: {
                _id: true,
                email: true,
                password: true,
                userType: true,
                tenantId: true,
                originalUserId: true,
            } as any,
        });
    }

    async findByEmailAndUserType(
        email: string,
        userType: ENUM_SHARED_USER_TYPE
    ): Promise<SharedUserEntity | null> {
        return this.sharedUserRepository.findOne({
            where: { email, userType } as any,
            select: {
                _id: true,
                email: true,
                password: true,
            } as any,
        });
    }

    async findByTenantId(tenantId: string): Promise<SharedUserEntity[]> {
        return this.sharedUserRepository.find({
            where: { tenantId } as any,
        });
    }

    async findByUserType(
        userType: ENUM_SHARED_USER_TYPE
    ): Promise<SharedUserEntity[]> {
        return this.sharedUserRepository.find({
            where: { userType } as any,
        });
    }

    async existsByEmail(email: string): Promise<boolean> {
        const count = await this.sharedUserRepository.count({
            where: {
                email: email.toLowerCase(),
                deleted: false,
            } as any,
        });
        return count > 0;
    }

    async updateByEmail(
        email: string,
        updateData: Partial<SharedUserEntity>
    ): Promise<SharedUserEntity> {
        let entity = await this.sharedUserRepository.findOne({
            where: { email } as any,
        });

        if (entity) {
            Object.assign(entity, updateData);
        } else {
            entity = this.sharedUserRepository.create({
                email,
                ...updateData,
            } as any) as unknown as SharedUserEntity;
        }

        return this.sharedUserRepository.save(entity);
    }

    async deleteByEmail(email: string): Promise<boolean> {
        const result = await this.sharedUserRepository.delete({
            email: email.toLowerCase(),
        } as any);
        return (result.affected || 0) > 0;
    }

    async existsByEmailExceptOriginalUserId(
        email: string,
        originalUserId?: string
    ): Promise<boolean> {
        const where: any = {
            email: email.toLowerCase(),
            deleted: false,
        };

        if (originalUserId) {
            where.originalUserId = Not(originalUserId);
        }

        const count = await this.sharedUserRepository.count({
            where,
        });
        return count > 0;
    }

    async deleteByTenantId(tenantId: string): Promise<number> {
        const result = await this.sharedUserRepository.delete({
            tenantId,
        } as any);
        return result.affected || 0;
    }

    async deleteByEmails(emails: string[]): Promise<number> {
        if (!emails || emails.length === 0) return 0;
        const lowerEmails = emails.map(e => e.toLowerCase());
        const result = await this.sharedUserRepository.delete({
            email: In(lowerEmails),
        } as any);
        return result.affected || 0;
    }

    async deleteByCompanyId(companyId: string): Promise<number> {
        const result = await this.sharedUserRepository.delete({
            companyId,
        } as any);
        return result.affected || 0;
    }
}
