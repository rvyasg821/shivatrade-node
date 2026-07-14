/**
 * City seed for an export/import business — the sea ports, airports and ICDs
 * goods actually move through, plus the sourcing and manufacturing hubs.
 *
 * NOT an exhaustive city list. There are hundreds of thousands, and a master
 * nobody maintains is worse than a short one. This is a starting set; the client
 * adds their real consignee and supplier cities from the Cities screen.
 *
 * Each row names its parent by (country_code, state_code) — ISO 3166-1 and
 * 3166-2. The seeder resolves that pair to a real state row, so a city can
 * never end up under the wrong parent, and skips (loudly) anything it cannot
 * resolve rather than guessing.
 *
 * NOTE the codes are namespaced by country: 'GA' is Goa in India and Georgia in
 * the US, 'LA' is Ladakh and Louisiana. That is why the lookup key is the PAIR
 * and not the state code alone.
 */
export interface ICitySeedRow {
    country_code: string;
    state_code: string;
    name: string;
}

const INDIA: ICitySeedRow[] = [
    // Gujarat — home state; Kandla/Mundra are India's biggest cargo ports
    { country_code: 'IN', state_code: 'GJ', name: 'Ahmedabad' },
    { country_code: 'IN', state_code: 'GJ', name: 'Surat' },
    { country_code: 'IN', state_code: 'GJ', name: 'Vadodara' },
    { country_code: 'IN', state_code: 'GJ', name: 'Rajkot' },
    { country_code: 'IN', state_code: 'GJ', name: 'Gandhinagar' },
    { country_code: 'IN', state_code: 'GJ', name: 'Bhavnagar' },
    { country_code: 'IN', state_code: 'GJ', name: 'Jamnagar' },
    { country_code: 'IN', state_code: 'GJ', name: 'Gandhidham' }, // Kandla port town
    { country_code: 'IN', state_code: 'GJ', name: 'Mundra' },
    { country_code: 'IN', state_code: 'GJ', name: 'Bharuch' },
    { country_code: 'IN', state_code: 'GJ', name: 'Ankleshwar' },
    { country_code: 'IN', state_code: 'GJ', name: 'Vapi' },
    { country_code: 'IN', state_code: 'GJ', name: 'Morbi' },

    // Maharashtra — JNPT/Nhava Sheva handles most Indian container exports
    { country_code: 'IN', state_code: 'MH', name: 'Mumbai' },
    { country_code: 'IN', state_code: 'MH', name: 'Navi Mumbai' },
    { country_code: 'IN', state_code: 'MH', name: 'Nhava Sheva' },
    { country_code: 'IN', state_code: 'MH', name: 'Thane' },
    { country_code: 'IN', state_code: 'MH', name: 'Pune' },
    { country_code: 'IN', state_code: 'MH', name: 'Nashik' },
    { country_code: 'IN', state_code: 'MH', name: 'Nagpur' },
    { country_code: 'IN', state_code: 'MH', name: 'Aurangabad' },

    // Tamil Nadu
    { country_code: 'IN', state_code: 'TN', name: 'Chennai' },
    { country_code: 'IN', state_code: 'TN', name: 'Ennore' },
    { country_code: 'IN', state_code: 'TN', name: 'Thoothukudi' }, // Tuticorin
    { country_code: 'IN', state_code: 'TN', name: 'Coimbatore' },
    { country_code: 'IN', state_code: 'TN', name: 'Tiruppur' },
    { country_code: 'IN', state_code: 'TN', name: 'Madurai' },

    // Karnataka / Kerala
    { country_code: 'IN', state_code: 'KA', name: 'Bengaluru' },
    { country_code: 'IN', state_code: 'KA', name: 'Mangaluru' },
    { country_code: 'IN', state_code: 'KA', name: 'Hubballi' },
    { country_code: 'IN', state_code: 'KL', name: 'Kochi' },
    { country_code: 'IN', state_code: 'KL', name: 'Kozhikode' },

    // Andhra Pradesh / Telangana
    { country_code: 'IN', state_code: 'AP', name: 'Visakhapatnam' },
    { country_code: 'IN', state_code: 'AP', name: 'Kakinada' },
    { country_code: 'IN', state_code: 'AP', name: 'Krishnapatnam' },
    { country_code: 'IN', state_code: 'TS', name: 'Hyderabad' },

    // East
    { country_code: 'IN', state_code: 'WB', name: 'Kolkata' },
    { country_code: 'IN', state_code: 'WB', name: 'Haldia' },
    { country_code: 'IN', state_code: 'OD', name: 'Paradip' },
    { country_code: 'IN', state_code: 'OD', name: 'Bhubaneswar' },

    // North
    { country_code: 'IN', state_code: 'DL', name: 'New Delhi' },
    { country_code: 'IN', state_code: 'HR', name: 'Gurugram' },
    { country_code: 'IN', state_code: 'HR', name: 'Faridabad' },
    { country_code: 'IN', state_code: 'UP', name: 'Noida' },
    { country_code: 'IN', state_code: 'UP', name: 'Kanpur' },
    { country_code: 'IN', state_code: 'UP', name: 'Agra' },
    { country_code: 'IN', state_code: 'UP', name: 'Moradabad' },
    { country_code: 'IN', state_code: 'PB', name: 'Ludhiana' },
    { country_code: 'IN', state_code: 'PB', name: 'Amritsar' },
    { country_code: 'IN', state_code: 'PB', name: 'Jalandhar' },
    { country_code: 'IN', state_code: 'RJ', name: 'Jaipur' },
    { country_code: 'IN', state_code: 'RJ', name: 'Jodhpur' },

    // Central / West
    { country_code: 'IN', state_code: 'MP', name: 'Indore' },
    { country_code: 'IN', state_code: 'GA', name: 'Vasco da Gama' }, // Mormugao port
];

const UNITED_STATES: ICitySeedRow[] = [
    // West coast — the main gateway for Asian imports
    { country_code: 'US', state_code: 'CA', name: 'Los Angeles' },
    { country_code: 'US', state_code: 'CA', name: 'Long Beach' },
    { country_code: 'US', state_code: 'CA', name: 'Oakland' },
    { country_code: 'US', state_code: 'CA', name: 'San Francisco' },
    { country_code: 'US', state_code: 'CA', name: 'San Diego' },
    { country_code: 'US', state_code: 'WA', name: 'Seattle' },
    { country_code: 'US', state_code: 'WA', name: 'Tacoma' },
    { country_code: 'US', state_code: 'OR', name: 'Portland' },

    // East coast
    { country_code: 'US', state_code: 'NY', name: 'New York' },
    { country_code: 'US', state_code: 'NJ', name: 'Newark' },
    { country_code: 'US', state_code: 'NJ', name: 'Elizabeth' },
    { country_code: 'US', state_code: 'PA', name: 'Philadelphia' },
    { country_code: 'US', state_code: 'MA', name: 'Boston' },
    { country_code: 'US', state_code: 'MD', name: 'Baltimore' },
    { country_code: 'US', state_code: 'VA', name: 'Norfolk' },
    { country_code: 'US', state_code: 'SC', name: 'Charleston' },
    { country_code: 'US', state_code: 'GA', name: 'Savannah' },
    { country_code: 'US', state_code: 'GA', name: 'Atlanta' },

    // Gulf coast
    { country_code: 'US', state_code: 'TX', name: 'Houston' },
    { country_code: 'US', state_code: 'TX', name: 'Dallas' },
    { country_code: 'US', state_code: 'TX', name: 'Laredo' }, // land border crossing
    { country_code: 'US', state_code: 'TX', name: 'El Paso' },
    { country_code: 'US', state_code: 'LA', name: 'New Orleans' },
    { country_code: 'US', state_code: 'AL', name: 'Mobile' },

    // Florida
    { country_code: 'US', state_code: 'FL', name: 'Miami' },
    { country_code: 'US', state_code: 'FL', name: 'Jacksonville' },
    { country_code: 'US', state_code: 'FL', name: 'Tampa' },

    // Inland hubs and distribution centres
    { country_code: 'US', state_code: 'IL', name: 'Chicago' },
    { country_code: 'US', state_code: 'MI', name: 'Detroit' },
    { country_code: 'US', state_code: 'OH', name: 'Cleveland' },
    { country_code: 'US', state_code: 'OH', name: 'Columbus' },
    { country_code: 'US', state_code: 'TN', name: 'Memphis' }, // FedEx global hub
    { country_code: 'US', state_code: 'KY', name: 'Louisville' }, // UPS global hub
    { country_code: 'US', state_code: 'MO', name: 'Kansas City' },
    { country_code: 'US', state_code: 'MN', name: 'Minneapolis' },
    { country_code: 'US', state_code: 'CO', name: 'Denver' },
    { country_code: 'US', state_code: 'UT', name: 'Salt Lake City' },
    { country_code: 'US', state_code: 'NV', name: 'Las Vegas' },
    { country_code: 'US', state_code: 'AZ', name: 'Phoenix' },
    { country_code: 'US', state_code: 'NC', name: 'Charlotte' },
    { country_code: 'US', state_code: 'DC', name: 'Washington' },

    // Non-contiguous
    { country_code: 'US', state_code: 'HI', name: 'Honolulu' },
    { country_code: 'US', state_code: 'AK', name: 'Anchorage' },
];

const UNITED_ARAB_EMIRATES: ICitySeedRow[] = [
    // Dubai — Jebel Ali is the largest port in the Middle East, and the free
    // zones (JAFZA, DAFZA) are where most re-export paperwork lands
    { country_code: 'AE', state_code: 'DU', name: 'Dubai' },
    { country_code: 'AE', state_code: 'DU', name: 'Jebel Ali' },
    { country_code: 'AE', state_code: 'DU', name: 'Deira' },
    { country_code: 'AE', state_code: 'DU', name: 'Al Quoz' },

    { country_code: 'AE', state_code: 'AZ', name: 'Abu Dhabi' },
    { country_code: 'AE', state_code: 'AZ', name: 'Musaffah' },
    { country_code: 'AE', state_code: 'AZ', name: 'Al Ain' },

    { country_code: 'AE', state_code: 'SH', name: 'Sharjah' },
    { country_code: 'AE', state_code: 'SH', name: 'Khor Fakkan' },

    { country_code: 'AE', state_code: 'AJ', name: 'Ajman' },
    { country_code: 'AE', state_code: 'FU', name: 'Fujairah' },
    { country_code: 'AE', state_code: 'RK', name: 'Ras Al Khaimah' },
    { country_code: 'AE', state_code: 'UQ', name: 'Umm Al Quwain' },
];

export const CITIES_SEED: ICitySeedRow[] = [
    ...INDIA,
    ...UNITED_STATES,
    ...UNITED_ARAB_EMIRATES,
];
