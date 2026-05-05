import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ExpenseRepository } from '../repository/repositories/expense.repository';
import { ExpenseDoc } from '../repository/entities/expense.entity';
import { ExpenseCreateRequestDto } from '../dtos/request/expense.create.request.dto';
import { ExpenseUpdateRequestDto } from '../dtos/request/expense.update.request.dto';
import { ExpenseGetResponseDto } from '../dtos/response/expense.get.response.dto';
import { ExpenseListResponseDto } from '../dtos/response/expense.list.response.dto';
import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class ExpenseService {
    private readonly logger = new Logger(ExpenseService.name);

    constructor(private readonly expenseRepository: ExpenseRepository) {}

    async create(
        companyId: string,
        data: ExpenseCreateRequestDto,
        createdBy: string
    ): Promise<ExpenseDoc> {
        const name = data.name.trim();
        const code = data.code.trim();

        if (await this.expenseRepository.isNameExists(companyId, name)) {
            throw new BadRequestException(
                `Expense '${name}' already exists for this company`
            );
        }
        if (await this.expenseRepository.isCodeExists(companyId, code)) {
            throw new BadRequestException(
                `Expense code '${code}' already exists for this company`
            );
        }

        const { _id: _ignored, ...rest } = data as any;
        const expense = await this.expenseRepository.create({
            ...rest,
            name,
            code,
            company_id: companyId,
            created_by: createdBy,
        } as any);

        this.logger.log(`Expense created: ${expense._id} for company: ${companyId}`);
        return expense;
    }

    async findOneById(
        expenseId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<ExpenseDoc> {
        const expense = await this.expenseRepository.findOneById(expenseId, options);
        if (!expense) throw new NotFoundException('Expense not found');
        return expense;
    }

    async findAll(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<ExpenseDoc[]> {
        return this.expenseRepository.findByCompanyId(companyId, options);
    }

    async update(expense: ExpenseDoc, data: ExpenseUpdateRequestDto): Promise<ExpenseDoc> {
        const companyId = expense.company_id.toString();

        if (data.name && data.name.trim() !== expense.name) {
            if (
                await this.expenseRepository.isNameExists(
                    companyId,
                    data.name.trim(),
                    expense._id.toString()
                )
            ) {
                throw new BadRequestException(
                    `Expense '${data.name.trim()}' already exists for this company`
                );
            }
            data.name = data.name.trim();
        }
        if (data.code && data.code.trim() !== expense.code) {
            if (
                await this.expenseRepository.isCodeExists(
                    companyId,
                    data.code.trim(),
                    expense._id.toString()
                )
            ) {
                throw new BadRequestException(
                    `Expense code '${data.code.trim()}' already exists for this company`
                );
            }
            data.code = data.code.trim();
        }

        Object.assign(expense, data);
        if (data.status !== undefined) {
            expense.is_active = data.status === 'active';
        } else if (data.is_active !== undefined) {
            expense.status = data.is_active
                ? ('active' as any)
                : ('inactive' as any);
        }
        const updated = await this.expenseRepository.save(expense);
        this.logger.log(`Expense updated: ${expense._id}`);
        return updated;
    }

    async softDelete(expense: ExpenseDoc, deletedBy?: string): Promise<ExpenseDoc> {
        expense.soft_delete = true;
        expense.is_active = false;
        (expense as any).deleted = true;
        (expense as any).deletedAt = new Date();
        if (deletedBy) (expense as any).deletedBy = deletedBy;
        const updated = await this.expenseRepository.save(expense);
        this.logger.log(`Expense soft deleted: ${expense._id}`);
        return updated;
    }

    mapGet(expense: ExpenseDoc): ExpenseGetResponseDto {
        return plainToInstance(ExpenseGetResponseDto, expense);
    }

    mapList(expenses: ExpenseDoc[]): ExpenseListResponseDto[] {
        return expenses.map((e) => plainToInstance(ExpenseListResponseDto, e));
    }
}
