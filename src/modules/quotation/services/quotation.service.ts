import {
    Injectable,
    Logger,
    NotFoundException,
    NotImplementedException,
} from '@nestjs/common';
import { QuotationRepository } from '../repository/repositories/quotation.repository';
import { QuotationLineRepository } from '../repository/repositories/quotation-line.repository';
import { QuotationExpenseRepository } from '../repository/repositories/quotation-expense.repository';
import { QuotationRebateRepository } from '../repository/repositories/quotation-rebate.repository';
import { QuotationDoc } from '../repository/entities/quotation.entity';
import { QuotationCreateRequestDto } from '../dtos/request/quotation.create.request.dto';
import { QuotationUpdateRequestDto } from '../dtos/request/quotation.update.request.dto';
import { QuotationGetResponseDto } from '../dtos/response/quotation.get.response.dto';

/**
 * Quotation service skeleton — Tuesday scaffold.
 *
 * Method signatures fixed today; recompute / costing / status-transition
 * side effects (Lead → Won) land Wednesday. Replace-on-update for nested
 * arrays follows the customer.service `replaceAddresses` pattern.
 */
@Injectable()
export class QuotationService {
    private readonly logger = new Logger(QuotationService.name);

    constructor(
        private readonly quotationRepository: QuotationRepository,
        private readonly quotationLineRepository: QuotationLineRepository,
        private readonly quotationExpenseRepository: QuotationExpenseRepository,
        private readonly quotationRebateRepository: QuotationRebateRepository
    ) {}

    async create(
        _companyId: string,
        _data: QuotationCreateRequestDto,
        _createdBy: string
    ): Promise<QuotationDoc> {
        throw new NotImplementedException('QuotationService.create — Wednesday');
    }

    async findOneById(id: string): Promise<QuotationDoc> {
        const row = await this.quotationRepository.findOneById(id);
        if (!row) throw new NotFoundException('Quotation not found');
        return row;
    }

    async update(
        _row: QuotationDoc,
        _data: QuotationUpdateRequestDto
    ): Promise<QuotationDoc> {
        throw new NotImplementedException('QuotationService.update — Wednesday');
    }

    async softDelete(row: QuotationDoc): Promise<void> {
        row.soft_delete = true;
        await this.quotationRepository.save(row);
        this.logger.log(`Quotation soft-deleted: ${row._id}`);
    }

    async mapList(rows: QuotationDoc[]): Promise<QuotationGetResponseDto[]> {
        // Hydration (customer/currency/lines/expenses/rebates) lands Wednesday.
        return rows.map((r) => ({
            _id: r._id?.toString(),
            voucher_no: r.voucher_no,
            lead_id: r.lead_id?.toString(),
            customer_id: r.customer_id?.toString(),
            customer_address_id: r.customer_address_id?.toString(),
            quotation_date: r.quotation_date,
            valid_until: r.valid_until,
            currency_id: r.currency_id?.toString(),
            exchange_rate: r.exchange_rate,
            payment_terms: r.payment_terms,
            delivery_terms: r.delivery_terms,
            delivery_location: r.delivery_location,
            notes_to_client: r.notes_to_client,
            internal_notes: r.internal_notes,
            subtotal: r.subtotal,
            expenses_total: r.expenses_total,
            rebates_total: r.rebates_total,
            margin_pct: r.margin_pct,
            margin_amount: r.margin_amount,
            tax_total: r.tax_total,
            grand_total: r.grand_total,
            status: r.status,
            version: r.version,
            parent_version_id: r.parent_version_id?.toString(),
            created_by: r.created_by?.toString(),
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
        }));
    }

    async mapGet(row: QuotationDoc): Promise<QuotationGetResponseDto> {
        const [mapped] = await this.mapList([row]);
        return mapped;
    }
}
