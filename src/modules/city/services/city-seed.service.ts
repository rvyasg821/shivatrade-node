import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CityRepository } from '@modules/city/repository/repositories/city.repository';
import { CityEntity } from '@modules/city/repository/entities/city.entity';
import { CITIES_SEED } from '@modules/city/seeds/cities.seed-data';
import { ENUM_CITY_STATUS } from '@modules/city/enums/city.enum';
import { StateRepository } from '@modules/state/repository/repositories/state.repository';
import { StateDoc } from '@modules/state/repository/entities/state.entity';
import { StateSeedService } from '@modules/state/services/state-seed.service';

/**
 * Seeds the export/import cities on first boot.
 *
 * Same rule as the country and state seeds: ONLY when the table is empty, never
 * an update, never a delete. Once the client curates the list — renames a city,
 * deactivates one, adds their own — a redeploy must not undo that.
 */
@Injectable()
export class CitySeedService implements OnApplicationBootstrap {
    private readonly logger = new Logger(CitySeedService.name);

    constructor(
        private readonly cityRepository: CityRepository,
        private readonly stateRepository: StateRepository,
        private readonly stateSeedService: StateSeedService
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            // Cities hang off states, which hang off countries. Drive the chain
            // explicitly rather than trusting Nest's bootstrap-hook ordering,
            // which follows module import order and would break the day someone
            // reshuffles the imports. Both calls are no-ops once populated.
            await this.stateSeedService.onApplicationBootstrap();
            await this.seedIfEmpty();
        } catch (err: any) {
            // A seed failure must never stop the app booting — the Cities
            // screen still works, it just starts empty.
            this.logger.error(`city seed skipped: ${err?.message}`);
        }
    }

    /**
     * Seeds PER COUNTRY, same as the state seed: a country that already has any
     * city in the master is left alone; one with none gets its full set.
     *
     * A whole-table emptiness check would mean adding the US to this seed does
     * nothing on a database that already has India — the new country could only
     * arrive via a manual wipe. Per-country, India keeps whatever the client has
     * curated and the US and UAE arrive on the next boot. Still never updates,
     * never deletes.
     */
    async seedIfEmpty(): Promise<number> {
        // Key on the (country, state) PAIR, never the state code alone: 'GA' is
        // Goa in India and Georgia in the US, 'LA' is Ladakh and Louisiana.
        // Keying on the code alone would silently file Savannah under Goa.
        const states: StateDoc[] = await this.stateRepository.findAll({});
        const byPair = new Map<string, StateDoc>();
        for (const s of states) {
            if (!s.state_code || !s.country_code) continue;
            byPair.set(this.key(s.country_code, s.state_code), s);
        }

        const rows: CityEntity[] = [];
        const orphans: string[] = [];
        const seededCountries: string[] = [];

        const wanted = [...new Set(CITIES_SEED.map((c) => c.country_code))];

        for (const code of wanted) {
            // Any city already under this country → the client has a list, and
            // we do not touch it.
            const countryId = [...byPair.values()].find(
                (s) => String(s.country_code).toUpperCase() === code.toUpperCase()
            )?.country_id;
            if (!countryId) {
                orphans.push(`${code} (no states seeded)`);
                continue;
            }

            const existing = await this.cityRepository.countByCountry(countryId);
            if (existing > 0) continue;

            for (const c of CITIES_SEED.filter(
                (x) => x.country_code.toUpperCase() === code.toUpperCase()
            )) {
                const state = byPair.get(this.key(c.country_code, c.state_code));
                if (!state) {
                    // Skip, don't guess — `country_id` is derived from the
                    // state, so a wrong state puts the city in the wrong country.
                    orphans.push(`${c.name} (${c.country_code}-${c.state_code})`);
                    continue;
                }

                const entity = new CityEntity();
                entity.name = c.name;
                entity.state_id = String(state._id);
                entity.country_id = state.country_id;
                entity.status = ENUM_CITY_STATUS.ACTIVE;
                rows.push(entity);
            }
            seededCountries.push(code);
        }

        if (orphans.length) {
            this.logger.warn(
                `city seed — ${orphans.length} skipped, no matching state: ${orphans.join(', ')}`
            );
        }
        if (!rows.length) return 0;

        await this.cityRepository.createMany<CityEntity>(rows);
        this.logger.log(
            `city master seeded — ${rows.length} cities for ${seededCountries.join(', ')}`
        );
        return rows.length;
    }

    private key(countryCode: string, stateCode: string): string {
        return `${countryCode.toUpperCase()}|${stateCode.toUpperCase()}`;
    }
}
