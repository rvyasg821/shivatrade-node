import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CountryRepository } from '@modules/country/repository/repositories/country.repository';
import { CountryEntity } from '@modules/country/repository/entities/country.entity';
import { COUNTRIES_SEED } from '@modules/country/seeds/countries.seed-data';
import { ENUM_COUNTRY_STATUS } from '@modules/country/enums/country.enum';
import slugify from 'slugify';

/**
 * Fills the country master on first boot so the screen and the address
 * dropdowns are never staring at an empty table.
 *
 * ONLY when the table is empty. It is not an upsert and it never updates or
 * deletes: once the client has curated their list — renamed a country,
 * deactivated one — a redeploy must not undo that. An empty table is the only
 * safe moment to write, and it happens exactly once in the life of the database.
 */
@Injectable()
export class CountrySeedService implements OnApplicationBootstrap {
    private readonly logger = new Logger(CountrySeedService.name);

    constructor(private readonly countryRepository: CountryRepository) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.seedIfEmpty();
        } catch (err: any) {
            // A seed failure must never stop the app from booting — the master
            // screen still works, it just starts empty and can be filled by hand.
            this.logger.error(`country seed skipped: ${err?.message}`);
        }
    }

    async seedIfEmpty(): Promise<number> {
        // withDeleted: a client who deleted every country still has a curated
        // list. Counting only live rows would see 0 and re-seed all 250 back.
        const existing = await this.countryRepository.getTotal(
            {},
            { withDeleted: true }
        );
        if (existing > 0) return 0;

        const rows = COUNTRIES_SEED.map((c) => {
            const entity = new CountryEntity();
            entity.name = c.name;
            entity.slug = slugify(c.name, { lower: true, strict: true, trim: true });
            entity.country_code = c.country_code;
            entity.currency_code = c.currency_code;
            entity.time_zone = c.time_zone;
            entity.status = ENUM_COUNTRY_STATUS.ACTIVE;
            return entity;
        });

        await this.countryRepository.createMany<CountryEntity>(rows);
        this.logger.log(`country master seeded — ${rows.length} countries`);
        return rows.length;
    }
}
