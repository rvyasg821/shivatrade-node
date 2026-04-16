import { Injectable, ConflictException } from '@nestjs/common';
import { CompanyLookupRepository } from '@modules/company-lookup/repository/repositories/company-lookup.repository';
import { CompanyLookupEntity, CompanyLookupDoc } from '@modules/company-lookup/repository/entities/company-lookup.entity';

@Injectable()
export class CompanyLookupService {
    constructor(
        private readonly companyLookupRepository: CompanyLookupRepository,
    ) {}

    async findByCompanyAndType(companyId: string, type: string): Promise<CompanyLookupDoc[]> {
        return this.companyLookupRepository.findAll(
            { companyId, type, isActive: true },
            { order: { name: 'asc' as any } },
        );
    }

    async create(companyId: string, type: string, name: string): Promise<CompanyLookupDoc> {
        // Case-insensitive duplicate check
        const existing = await this.companyLookupRepository.findOne({
            companyId,
            type,
            name,
        });
        if (existing) {
            if (!existing.isActive) {
                // Re-activate soft-deleted entry
                existing.isActive = true;
                return this.companyLookupRepository.save(existing);
            }
            throw new ConflictException(`A ${type} with this name already exists`);
        }

        const entity = new CompanyLookupEntity();
        entity.companyId = companyId;
        entity.type = type;
        entity.name = name.trim();
        entity.isActive = true;

        return this.companyLookupRepository.create<CompanyLookupEntity>(entity);
    }

    async update(id: string, name: string): Promise<CompanyLookupDoc> {
        const entity = await this.companyLookupRepository.findOneById(id);
        entity.name = name.trim();
        return this.companyLookupRepository.save(entity);
    }

    async softDelete(id: string): Promise<void> {
        const entity = await this.companyLookupRepository.findOneById(id);
        entity.isActive = false;
        await this.companyLookupRepository.save(entity);
    }

    mapGet(doc: CompanyLookupDoc) {
        return {
            _id: doc._id,
            companyId: doc.companyId,
            type: doc.type,
            name: doc.name,
            isActive: doc.isActive,
        };
    }
}
