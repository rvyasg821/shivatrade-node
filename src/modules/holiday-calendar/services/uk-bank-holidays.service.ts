import { Injectable, Logger } from '@nestjs/common';

export interface IUkBankHoliday {
    name: string;
    date: string; // YYYY-MM-DD
}

@Injectable()
export class UkBankHolidaysService {
    private readonly logger = new Logger(UkBankHolidaysService.name);

    /**
     * Returns UK bank holidays for England and Wales for the given year.
     * Data sourced from gov.uk — hard-coded for 2024-2027 to avoid external HTTP dependency.
     * Extend this map or integrate live fetch as needed.
     */
    getUkBankHolidays(year: number): IUkBankHoliday[] {
        const holidays: Record<number, IUkBankHoliday[]> = {
            2024: [
                { name: "New Year's Day", date: '2024-01-01' },
                { name: 'Good Friday', date: '2024-03-29' },
                { name: 'Easter Monday', date: '2024-04-01' },
                { name: 'Early May Bank Holiday', date: '2024-05-06' },
                { name: 'Spring Bank Holiday', date: '2024-05-27' },
                { name: 'Summer Bank Holiday', date: '2024-08-26' },
                { name: 'Christmas Day', date: '2024-12-25' },
                { name: 'Boxing Day', date: '2024-12-26' },
            ],
            2025: [
                { name: "New Year's Day", date: '2025-01-01' },
                { name: 'Good Friday', date: '2025-04-18' },
                { name: 'Easter Monday', date: '2025-04-21' },
                { name: 'Early May Bank Holiday', date: '2025-05-05' },
                { name: 'Spring Bank Holiday', date: '2025-05-26' },
                { name: 'Summer Bank Holiday', date: '2025-08-25' },
                { name: 'Christmas Day', date: '2025-12-25' },
                { name: 'Boxing Day', date: '2025-12-26' },
            ],
            2026: [
                { name: "New Year's Day", date: '2026-01-01' },
                { name: 'Good Friday', date: '2026-04-03' },
                { name: 'Easter Monday', date: '2026-04-06' },
                { name: 'Early May Bank Holiday', date: '2026-05-04' },
                { name: 'Spring Bank Holiday', date: '2026-05-25' },
                { name: 'Summer Bank Holiday', date: '2026-08-31' },
                { name: 'Christmas Day', date: '2026-12-25' },
                { name: 'Boxing Day', date: '2026-12-28' }, // substitute
            ],
            2027: [
                { name: "New Year's Day", date: '2027-01-01' },
                { name: 'Good Friday', date: '2027-03-26' },
                { name: 'Easter Monday', date: '2027-03-29' },
                { name: 'Early May Bank Holiday', date: '2027-05-03' },
                { name: 'Spring Bank Holiday', date: '2027-05-31' },
                { name: 'Summer Bank Holiday', date: '2027-08-30' },
                { name: 'Christmas Day', date: '2027-12-27' }, // substitute
                { name: 'Boxing Day', date: '2027-12-28' }, // substitute
            ],
        };

        return holidays[year] ?? [];
    }
}
