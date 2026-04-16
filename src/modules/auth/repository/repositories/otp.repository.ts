import { Injectable } from '@nestjs/common';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { OTPEntity } from '../entities/otp.entity';

@Injectable()
export class OTPRepository extends DatabaseObjectIdRepositoryBase<
    OTPEntity
> {
    constructor(
        @InjectDatabaseModel(OTPEntity)
        private readonly otpRepository: Repository<OTPEntity>
    ) {
        super(otpRepository);
    }

    async findByEmail(email: string): Promise<OTPEntity | null> {
        return this.otpRepository.findOne({
            where: {
                email: email.toLowerCase(),
                expiresAt: MoreThan(new Date()),
            },
            select: {
                _id: true,
                email: true,
                otpHash: true,
                expiresAt: true,
                attempts: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    async deleteByEmail(email: string): Promise<void> {
        await this.otpRepository.delete({
            email: email.toLowerCase(),
        });
    }

    async deleteExpired(): Promise<number> {
        const result = await this.otpRepository.delete({
            expiresAt: LessThan(new Date()),
        });
        return result.affected || 0;
    }

    async incrementAttempts(id: string): Promise<OTPEntity | null> {
        await this.otpRepository.increment({ _id: id } as any, 'attempts', 1);
        return this.otpRepository.findOne({ where: { _id: id } as any });
    }

    async findValidOTPByEmail(email: string): Promise<OTPEntity | null> {
        return this.otpRepository.findOne({
            where: {
                email: email.toLowerCase(),
                expiresAt: MoreThan(new Date()),
                attempts: LessThan(5),
            },
            select: {
                _id: true,
                email: true,
                otpHash: true,
                expiresAt: true,
                attempts: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }
}
