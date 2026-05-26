import { Command } from 'nestjs-command';
import { Injectable, Logger } from '@nestjs/common';

import { PortMasterService } from '@modules/port-master/services/port-master.service';
import { INDIA_PORTS_SEED } from '@modules/port-master/seeds/india-ports.seed-data';

@Injectable()
export class MigrationPortMasterSeed {
    private readonly logger = new Logger(MigrationPortMasterSeed.name);

    constructor(private readonly portMasterService: PortMasterService) {}

    @Command({
        command: 'seed:port-master',
        describe:
            'Seed port master with ICEGATE Indian customs codes (idempotent upsert by code)',
    })
    async seeds(): Promise<void> {
        this.logger.log(
            `Seeding ${INDIA_PORTS_SEED.length} Indian port master rows...`
        );

        let created = 0;
        let updated = 0;
        let failed = 0;

        for (const row of INDIA_PORTS_SEED) {
            try {
                // upsertByCode returns the row; we don't distinguish
                // create-vs-update count cheaply, so just track total.
                await this.portMasterService.upsertByCode({
                    code: row.code,
                    name: row.name,
                    type: row.type,
                    country_code: 'IN',
                    state: row.state,
                    is_active: true,
                });
                // Heuristic: assume update if code was already known (cheaper
                // than re-checking). We'll count both as "applied".
                updated += 1;
            } catch (err: any) {
                failed += 1;
                this.logger.error(
                    `  ✗ ${row.code} - ${row.name}: ${err?.message || err}`
                );
            }
        }

        this.logger.log(
            `✅ Port master seed complete: ${updated} applied, ${created} new, ${failed} failed`
        );
    }
}
