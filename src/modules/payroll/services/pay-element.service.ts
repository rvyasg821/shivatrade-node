import { Injectable, NotFoundException } from '@nestjs/common';
import { PayElementRepository } from '../repository/repositories/pay-element.repository';
import { PayElementEntity } from '../repository/entities/pay-element.entity';

@Injectable()
export class PayElementService {
    constructor(private readonly repo: PayElementRepository) {}

    async list(companyId: string): Promise<PayElementEntity[]> {
        return (await this.repo.findAll(
            { company_id: companyId, soft_delete: false },
            { order: { type: 'ASC' as any, name: 'ASC' as any } },
        )) as PayElementEntity[];
    }

    async findOneById(id: string): Promise<PayElementEntity> {
        const item = (await this.repo.findOneById(id)) as PayElementEntity;
        if (!item) throw new NotFoundException('Pay element not found');
        return item;
    }

    async create(companyId: string, data: Partial<PayElementEntity>, actionBy?: string): Promise<PayElementEntity> {
        return this.repo.create({ ...data, company_id: companyId, soft_delete: false } as any, { actionBy });
    }

    async update(id: string, data: Partial<PayElementEntity>, actionBy?: string): Promise<PayElementEntity> {
        await this.findOneById(id);
        return (await this.repo.update({ _id: id }, data as any, { actionBy })) as PayElementEntity;
    }

    async softDelete(id: string, actionBy?: string): Promise<void> {
        const item = await this.findOneById(id);
        await this.repo.update({ _id: item._id }, { soft_delete: true } as any, { actionBy });
    }
}
