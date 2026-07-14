import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { StateRepository } from '@modules/state/repository/repositories/state.repository';
import { StateEntity } from '@modules/state/repository/entities/state.entity';
import { STATES_SEED } from '@modules/state/seeds/states.seed-data';
import { ENUM_STATE_STATUS } from '@modules/state/enums/state.enum';
import { CountryRepository } from '@modules/country/repository/repositories/country.repository';
import { CountrySeedService } from '@modules/country/services/country-seed.service';

/**
 * Seeds the subdivisions of the countries the business trades through — India,
 * the United States, the UAE — on first boot.
 *
 * Same rule as the country seed: only when the table is empty, never an update,
 * never a delete. A curated list is never overwritten by a redeploy.
 */
@Injectable()
export class StateSeedService implements OnApplicationBootstrap {
    private readonly logger = new Logger(StateSeedService.name);

    constructor(
        private readonly stateRepository: StateRepository,
        private readonly countryRepository: CountryRepository,
        private readonly countrySeedService: CountrySeedService
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            // States hang off a country row, so the countries must be in place
            // first. Calling the country seed directly — rather than trusting
            // Nest's bootstrap-hook ordering, which depends on module import
            // order and would break the day someone reshuffles the imports.
            // It is a no-op when the table is already populated.
            await this.countrySeedService.seedIfEmpty();
            await this.seedIfEmpty();
        } catch (err: any) {
            this.logger.error(`state seed skipped: ${err?.message}`);
        }
    }

    /**
     * Seeds PER COUNTRY, not per table: a country whose states are already in
     * the master is left completely alone; one with none gets its full set.
     *
     * The granularity matters. A plain "only if the whole table is empty" check
     * would mean adding the US to this seed does nothing on any database that
     * already has India — the new country could only ever arrive via a manual
     * wipe. Per-country, India stays exactly as the client curated it and the
     * US and UAE arrive on the next boot.
     *
     * It still never updates and never deletes. Delete a US state and it does
     * NOT come back on restart, because the country is no longer empty.
     */
    async seedIfEmpty(): Promise<number> {
        // One lookup for every country the seed mentions, keyed by ISO-2.
        const wanted = [...new Set(STATES_SEED.map((s) => s.country_code))];
        const countries = await this.countryRepository.findAll({
            country_code: { $in: wanted },
        });
        const byCode = new Map(
            countries.map((c): [string, typeof c] => [
                String(c.country_code).toUpperCase(),
                c,
            ])
        );

        const rows: StateEntity[] = [];
        const missing = new Set<string>();
        const seededCountries: string[] = [];

        for (const code of wanted) {
            const country = byCode.get(code.toUpperCase());
            if (!country) {
                // Skip rather than guess: a state under the wrong country would
                // corrupt every dropdown that filters by country.
                missing.add(code);
                continue;
            }

            // withDeleted-equivalent: countByCountry only counts live rows, but
            // a soft-deleted state still holds its slot in the unique index, so
            // re-inserting it would blow up. Counting live rows is the right
            // check anyway — if ANY state survives for this country, the client
            // has a list and we do not touch it.
            const existing = await this.stateRepository.countByCountry(
                String(country._id)
            );
            if (existing > 0) continue;

            for (const s of STATES_SEED.filter(
                (x) => x.country_code.toUpperCase() === code.toUpperCase()
            )) {
                const entity = new StateEntity();
                entity.name = s.name;
                entity.state_code = s.state_code;
                entity.country_id = String(country._id);
                entity.country_code = country.country_code;
                entity.status = ENUM_STATE_STATUS.ACTIVE;
                rows.push(entity);
            }
            seededCountries.push(code);
        }

        if (missing.size) {
            this.logger.warn(
                `state seed — no country row for: ${[...missing].join(', ')}`
            );
        }
        if (!rows.length) return 0;

        await this.stateRepository.createMany<StateEntity>(rows);
        this.logger.log(
            `state master seeded — ${rows.length} states/provinces for ${seededCountries.join(', ')}`
        );
        return rows.length;
    }
}
