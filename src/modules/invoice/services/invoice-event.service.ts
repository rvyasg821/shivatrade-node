import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

import { InvoiceEventRepository } from '../repository/repositories/invoice-event.repository';
import { InvoiceDoc } from '../repository/entities/invoice.entity';
import { InvoiceEventDoc } from '../repository/entities/invoice-event.entity';
import { InvoiceEventCreateRequestDto } from '../dtos/request/invoice-event.create.request.dto';
import { InvoiceEventResponseDto } from '../dtos/response/invoice-event.response.dto';
import { UserRepository } from '@modules/user/repository/repositories/user.repository';

/**
 * Manual invoice tracking-event timeline (SHIPPING_INVOICE_MERGE_PLAN §8).
 * Re-homed verbatim from the shipping-event stack: manual append, single
 * attachment, retract-with-reason, creator-name enrichment. No system
 * lifecycle events — events are always appendable regardless of invoice status.
 */
@Injectable()
export class InvoiceEventService {
    constructor(
        private readonly invoiceEventRepository: InvoiceEventRepository,
        private readonly userRepository: UserRepository
    ) {}

    async addEvent(
        invoice: InvoiceDoc,
        data: InvoiceEventCreateRequestDto,
        userId: string,
        attachmentUrl?: string
    ): Promise<InvoiceEventDoc> {
        return this.invoiceEventRepository.create({
            invoice_id: invoice._id.toString(),
            company_id: invoice.company_id.toString(),
            type: data.type,
            type_other: data.type_other,
            occurred_at: new Date(data.occurred_at),
            location: data.location,
            notes: data.notes,
            attachment_url: attachmentUrl,
            created_by: userId,
        } as any);
    }

    async retractEvent(
        eventId: string,
        userId: string,
        reason: string
    ): Promise<void> {
        const ev: any = await this.invoiceEventRepository.findOneById(eventId);
        if (!ev) throw new NotFoundException('Event not found');
        if (ev.soft_delete) {
            throw new BadRequestException('Event is already retracted.');
        }
        if (!reason || !reason.trim()) {
            throw new BadRequestException(
                'A reason is required to retract an event.'
            );
        }
        ev.soft_delete = true;
        ev.deleted_at = new Date();
        ev.deleted_by_user_id = userId;
        ev.deleted_reason = reason.trim();
        await this.invoiceEventRepository.save(ev);
    }

    /**
     * Full timeline (incl. retracted) for the invoice, newest-first, with
     * created_by / deleted_by user names resolved in one batch lookup.
     */
    async listForInvoice(
        invoiceId: string
    ): Promise<InvoiceEventResponseDto[]> {
        const events = await this.invoiceEventRepository.findAllByInvoiceId(
            invoiceId
        );
        if (!events.length) return [];

        const userIds = Array.from(
            new Set(
                events
                    .flatMap((e: any) => [
                        e.created_by?.toString(),
                        e.deleted_by_user_id?.toString(),
                    ])
                    .filter(Boolean)
            )
        );
        const userNameMap = new Map<string, string>();
        if (userIds.length) {
            const users: any[] = await this.userRepository.findAll({
                _id: { $in: userIds },
            } as any);
            for (const u of users) {
                userNameMap.set(
                    u._id.toString(),
                    u.name || u.contact_name || u.email || ''
                );
            }
        }

        return events.map((e: any) => {
            const ev: any = plainToInstance(InvoiceEventResponseDto, e);
            if (e.created_by) {
                ev.created_by_name = userNameMap.get(e.created_by.toString());
            }
            if (e.deleted_by_user_id) {
                ev.deleted_by_name = userNameMap.get(
                    e.deleted_by_user_id.toString()
                );
            }
            return ev;
        });
    }
}
