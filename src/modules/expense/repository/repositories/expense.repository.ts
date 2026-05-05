import { Injectable } from '@nestjs/common';
import { Repository, Not, ILike } from 'typeorm';
import { DatabaseObjectIdRepositoryBase } from '@common/database/bases/database.object-id.repository';
import { InjectDatabaseModel } from '@common/database/decorators/database.decorator';
import { ExpenseDoc, ExpenseEntity } from '../entities/expense.entity';

@Injectable()
export class ExpenseRepository extends DatabaseObjectIdRepositoryBase<ExpenseEntity> {
    constructor(
        @InjectDatabaseModel(ExpenseEntity)
        private readonly expenseRepository: Repository<ExpenseEntity>
    ) {
        super(expenseRepository);
    }

    async findByCompanyId(
        companyId: string,
        options?: any
    ): Promise<ExpenseDoc[]> {
        return this.findAll(
            { company_id: companyId, soft_delete: false },
            options
        );
    }

    async isNameExists(
        companyId: string,
        name: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            name: ILike(name.trim()),
            soft_delete: false,
        };
        if (excludeId) where._id = Not(excludeId);
        const count = await this._repository.count({ where });
        return count > 0;
    }

    async isCodeExists(
        companyId: string,
        code: string,
        excludeId?: string
    ): Promise<boolean> {
        const where: any = {
            company_id: companyId,
            code: ILike(code.trim()),
            soft_delete: false,
        };
        if (excludeId) where._id = Not(excludeId);
        const count = await this._repository.count({ where });
        return count > 0;
    }
}
