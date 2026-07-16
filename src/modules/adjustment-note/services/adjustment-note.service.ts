import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { CustomerRepository } from '@modules/customer/repository/repositories/customer.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { CompanyService } from '@modules/company/services/company.service';
import { VoucherService } from '@common/voucher/services/voucher.service';
import { ENUM_VOUCHER_DOC_TYPE } from '@common/voucher/enums/voucher-doc-type.enum';
import { AdjustmentNoteRepository } from '../repository/repositories/adjustment-note.repository';
import { AdjustmentNoteDoc } from '../repository/entities/adjustment-note.entity';
import { AdjustmentNoteCreateRequestDto } from '../dtos/request/adjustment-note.create.request.dto';
import { AdjustmentNoteResponseDto } from '../dtos/response/adjustment-note.response.dto';
import {
    ENUM_ADJUSTMENT_PARTY_TYPE,
    ENUM_ADJUSTMENT_DIRECTION,
} from '../enums/adjustment-note.enum';

export interface AdjustmentNoteListQuery {
    party_type?: string;
    party_id?: string;
    direction?: string;
    date_from?: string;
    date_to?: string;
    search?: any;
    limit?: number;
    offset?: number;
    order?: any;
}

@Injectable()
export class AdjustmentNoteService {
    private readonly logger = new Logger(AdjustmentNoteService.name);

    constructor(
        private readonly repo: AdjustmentNoteRepository,
        private readonly customerRepository: CustomerRepository,
        private readonly vendorRepository: VendorRepository,
        private readonly companyService: CompanyService,
        private readonly voucherService: VoucherService
    ) {}

    private async resolveCompanyPrefix(companyId: string): Promise<string> {
        const company: any = await this.companyService.findOneById(companyId);
        const explicit = company?.voucher_prefix?.trim();
        if (explicit) return explicit.toUpperCase();
        return (
            (company?.company_name as string | undefined)
                ?.replace(/[^A-Za-z0-9]/g, '')
                .slice(0, 5)
                .toUpperCase() || 'CO'
        );
    }

    async create(
        companyId: string,
        dto: AdjustmentNoteCreateRequestDto,
        userId: string
    ): Promise<AdjustmentNoteResponseDto> {
        if (Number(dto.amount) <= 0) {
            throw new BadRequestException('Amount must be greater than 0.');
        }

        // Resolve the party, snapshot its name, and pin the currency:
        //   customer → the customer's trading currency (USD/Dinar/…)
        //   vendor   → always INR
        let partyName = '';
        let currencyCode = 'INR';
        if (dto.party_type === ENUM_ADJUSTMENT_PARTY_TYPE.CUSTOMER) {
            const c: any = await this.customerRepository.findOneById(
                dto.party_id
            );
            if (!c || c.company_id?.toString() !== companyId || c.soft_delete) {
                throw new NotFoundException('Customer not found.');
            }
            partyName = c.company_name;
            currencyCode = c.currency || 'INR';
        } else {
            const v: any = await this.vendorRepository.findOneById(dto.party_id);
            if (!v || v.company_id?.toString() !== companyId || v.soft_delete) {
                throw new NotFoundException('Vendor not found.');
            }
            partyName = v.company_name;
            currencyCode = 'INR';
        }

        const prefix = await this.resolveCompanyPrefix(companyId);
        const voucherNo = await this.voucherService.getNext(
            companyId,
            ENUM_VOUCHER_DOC_TYPE.ADJUSTMENT_NOTE,
            prefix,
            new Date(dto.note_date)
        );

        const note = await this.repo.create({
            company_id: companyId,
            voucher_no: voucherNo,
            party_type: dto.party_type,
            party_id: dto.party_id,
            party_snapshot: { name: partyName },
            direction: dto.direction,
            note_date: dto.note_date,
            amount: dto.amount,
            currency_code: currencyCode,
            reason: dto.reason,
            created_by: userId,
        } as any);

        this.logger.log(
            `Adjustment note ${voucherNo} (${dto.direction} ${currencyCode} ${dto.amount}) → ${dto.party_type} ${partyName}`
        );
        return this.mapOne(note);
    }

    async list(
        companyId: string,
        query: AdjustmentNoteListQuery
    ): Promise<{ data: AdjustmentNoteResponseDto[]; total: number }> {
        const find: Record<string, any> = {
            company_id: companyId,
            soft_delete: false,
        };
        if (query.party_type) find.party_type = query.party_type;
        if (query.party_id) find.party_id = query.party_id;
        if (query.direction) find.direction = query.direction;
        if (query.date_from || query.date_to) {
            find.note_date = {};
            if (query.date_from) find.note_date.$gte = query.date_from;
            if (query.date_to) find.note_date.$lte = query.date_to;
        }
        // _search is a pre-built { $or: [...] } filter from PaginationSearchPipe
        // (availableSearch: voucher_no, reason). Merge it into the find.
        if (
            query.search &&
            typeof query.search === 'object' &&
            Object.keys(query.search).length
        ) {
            Object.assign(find, query.search);
        }

        const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
        const offset = Math.max(0, Number(query.offset) || 0);

        const [rows, total] = await Promise.all([
            this.repo.findAll(find, {
                paging: { limit, offset },
                order: query.order || { note_date: 'DESC', createdAt: 'DESC' },
            } as any),
            this.repo.getTotal(find),
        ]);

        return { data: (rows as AdjustmentNoteDoc[]).map(this.mapOne), total };
    }

    async void(
        companyId: string,
        id: string,
        userId: string,
        reason?: string
    ): Promise<void> {
        const note: any = await this.repo.findOneById(id);
        if (
            !note ||
            note.soft_delete ||
            note.company_id?.toString() !== companyId
        ) {
            throw new NotFoundException('Adjustment note not found.');
        }
        if (note.voided_at) {
            throw new BadRequestException('This note is already voided.');
        }
        note.voided_at = new Date();
        note.voided_by = userId;
        note.voided_reason = reason || null;
        await this.repo.save(note);
        this.logger.log(`Adjustment note ${note.voucher_no} voided.`);
    }

    private mapOne(n: AdjustmentNoteDoc): AdjustmentNoteResponseDto {
        return {
            _id: (n as any)._id.toString(),
            voucher_no: n.voucher_no,
            party_type: n.party_type,
            party_id: (n as any).party_id?.toString(),
            party_name: (n as any).party_snapshot?.name,
            direction: n.direction,
            note_date: n.note_date,
            amount: String(n.amount ?? '0'),
            currency_code: n.currency_code,
            reason: n.reason,
            voided_at: (n as any).voided_at || undefined,
            voided_reason: (n as any).voided_reason || undefined,
            created_by: (n as any).created_by?.toString(),
            createdAt: (n as any).createdAt,
        };
    }
}
