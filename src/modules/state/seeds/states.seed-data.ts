/**
 * State / province seed, keyed by country.
 *
 * Three countries the business actually trades through:
 *   IN — India (28 states + 8 union territories), the home market
 *   US — United States (50 states + DC), the largest export destination
 *   AE — United Arab Emirates (7 emirates), the Gulf re-export hub
 *
 * Codes are ISO 3166-2 subdivision codes. For India they are the same codes GST
 * registrations are keyed on. Anything else the client needs, they add from the
 * States screen — this seed is a starting point, not a world atlas.
 */
export interface IStateSeedRow {
    /** ISO 3166-1 alpha-2 of the parent country. */
    country_code: string;
    name: string;
    state_code: string;
}

const INDIA: IStateSeedRow[] = [
    // States
    { country_code: 'IN', name: 'Andhra Pradesh', state_code: 'AP' },
    { country_code: 'IN', name: 'Arunachal Pradesh', state_code: 'AR' },
    { country_code: 'IN', name: 'Assam', state_code: 'AS' },
    { country_code: 'IN', name: 'Bihar', state_code: 'BR' },
    { country_code: 'IN', name: 'Chhattisgarh', state_code: 'CG' },
    { country_code: 'IN', name: 'Goa', state_code: 'GA' },
    { country_code: 'IN', name: 'Gujarat', state_code: 'GJ' },
    { country_code: 'IN', name: 'Haryana', state_code: 'HR' },
    { country_code: 'IN', name: 'Himachal Pradesh', state_code: 'HP' },
    { country_code: 'IN', name: 'Jharkhand', state_code: 'JH' },
    { country_code: 'IN', name: 'Karnataka', state_code: 'KA' },
    { country_code: 'IN', name: 'Kerala', state_code: 'KL' },
    { country_code: 'IN', name: 'Madhya Pradesh', state_code: 'MP' },
    { country_code: 'IN', name: 'Maharashtra', state_code: 'MH' },
    { country_code: 'IN', name: 'Manipur', state_code: 'MN' },
    { country_code: 'IN', name: 'Meghalaya', state_code: 'ML' },
    { country_code: 'IN', name: 'Mizoram', state_code: 'MZ' },
    { country_code: 'IN', name: 'Nagaland', state_code: 'NL' },
    { country_code: 'IN', name: 'Odisha', state_code: 'OD' },
    { country_code: 'IN', name: 'Punjab', state_code: 'PB' },
    { country_code: 'IN', name: 'Rajasthan', state_code: 'RJ' },
    { country_code: 'IN', name: 'Sikkim', state_code: 'SK' },
    { country_code: 'IN', name: 'Tamil Nadu', state_code: 'TN' },
    { country_code: 'IN', name: 'Telangana', state_code: 'TS' },
    { country_code: 'IN', name: 'Tripura', state_code: 'TR' },
    { country_code: 'IN', name: 'Uttar Pradesh', state_code: 'UP' },
    { country_code: 'IN', name: 'Uttarakhand', state_code: 'UK' },
    { country_code: 'IN', name: 'West Bengal', state_code: 'WB' },
    // Union territories
    { country_code: 'IN', name: 'Andaman and Nicobar Islands', state_code: 'AN' },
    { country_code: 'IN', name: 'Chandigarh', state_code: 'CH' },
    {
        country_code: 'IN',
        name: 'Dadra and Nagar Haveli and Daman and Diu',
        state_code: 'DH',
    },
    { country_code: 'IN', name: 'Delhi', state_code: 'DL' },
    { country_code: 'IN', name: 'Jammu and Kashmir', state_code: 'JK' },
    { country_code: 'IN', name: 'Ladakh', state_code: 'LA' },
    { country_code: 'IN', name: 'Lakshadweep', state_code: 'LD' },
    { country_code: 'IN', name: 'Puducherry', state_code: 'PY' },
];

const UNITED_STATES: IStateSeedRow[] = [
    { country_code: 'US', name: 'Alabama', state_code: 'AL' },
    { country_code: 'US', name: 'Alaska', state_code: 'AK' },
    { country_code: 'US', name: 'Arizona', state_code: 'AZ' },
    { country_code: 'US', name: 'Arkansas', state_code: 'AR' },
    { country_code: 'US', name: 'California', state_code: 'CA' },
    { country_code: 'US', name: 'Colorado', state_code: 'CO' },
    { country_code: 'US', name: 'Connecticut', state_code: 'CT' },
    { country_code: 'US', name: 'Delaware', state_code: 'DE' },
    { country_code: 'US', name: 'District of Columbia', state_code: 'DC' },
    { country_code: 'US', name: 'Florida', state_code: 'FL' },
    { country_code: 'US', name: 'Georgia', state_code: 'GA' },
    { country_code: 'US', name: 'Hawaii', state_code: 'HI' },
    { country_code: 'US', name: 'Idaho', state_code: 'ID' },
    { country_code: 'US', name: 'Illinois', state_code: 'IL' },
    { country_code: 'US', name: 'Indiana', state_code: 'IN' },
    { country_code: 'US', name: 'Iowa', state_code: 'IA' },
    { country_code: 'US', name: 'Kansas', state_code: 'KS' },
    { country_code: 'US', name: 'Kentucky', state_code: 'KY' },
    { country_code: 'US', name: 'Louisiana', state_code: 'LA' },
    { country_code: 'US', name: 'Maine', state_code: 'ME' },
    { country_code: 'US', name: 'Maryland', state_code: 'MD' },
    { country_code: 'US', name: 'Massachusetts', state_code: 'MA' },
    { country_code: 'US', name: 'Michigan', state_code: 'MI' },
    { country_code: 'US', name: 'Minnesota', state_code: 'MN' },
    { country_code: 'US', name: 'Mississippi', state_code: 'MS' },
    { country_code: 'US', name: 'Missouri', state_code: 'MO' },
    { country_code: 'US', name: 'Montana', state_code: 'MT' },
    { country_code: 'US', name: 'Nebraska', state_code: 'NE' },
    { country_code: 'US', name: 'Nevada', state_code: 'NV' },
    { country_code: 'US', name: 'New Hampshire', state_code: 'NH' },
    { country_code: 'US', name: 'New Jersey', state_code: 'NJ' },
    { country_code: 'US', name: 'New Mexico', state_code: 'NM' },
    { country_code: 'US', name: 'New York', state_code: 'NY' },
    { country_code: 'US', name: 'North Carolina', state_code: 'NC' },
    { country_code: 'US', name: 'North Dakota', state_code: 'ND' },
    { country_code: 'US', name: 'Ohio', state_code: 'OH' },
    { country_code: 'US', name: 'Oklahoma', state_code: 'OK' },
    { country_code: 'US', name: 'Oregon', state_code: 'OR' },
    { country_code: 'US', name: 'Pennsylvania', state_code: 'PA' },
    { country_code: 'US', name: 'Rhode Island', state_code: 'RI' },
    { country_code: 'US', name: 'South Carolina', state_code: 'SC' },
    { country_code: 'US', name: 'South Dakota', state_code: 'SD' },
    { country_code: 'US', name: 'Tennessee', state_code: 'TN' },
    { country_code: 'US', name: 'Texas', state_code: 'TX' },
    { country_code: 'US', name: 'Utah', state_code: 'UT' },
    { country_code: 'US', name: 'Vermont', state_code: 'VT' },
    { country_code: 'US', name: 'Virginia', state_code: 'VA' },
    { country_code: 'US', name: 'Washington', state_code: 'WA' },
    { country_code: 'US', name: 'West Virginia', state_code: 'WV' },
    { country_code: 'US', name: 'Wisconsin', state_code: 'WI' },
    { country_code: 'US', name: 'Wyoming', state_code: 'WY' },
];

/**
 * The UAE has no states — it has seven emirates, and they are what an address
 * there actually names. They sit in the state master because that is the level
 * of the hierarchy they occupy: country → emirate → city.
 */
const UNITED_ARAB_EMIRATES: IStateSeedRow[] = [
    { country_code: 'AE', name: 'Abu Dhabi', state_code: 'AZ' },
    { country_code: 'AE', name: 'Ajman', state_code: 'AJ' },
    { country_code: 'AE', name: 'Dubai', state_code: 'DU' },
    { country_code: 'AE', name: 'Fujairah', state_code: 'FU' },
    { country_code: 'AE', name: 'Ras Al Khaimah', state_code: 'RK' },
    { country_code: 'AE', name: 'Sharjah', state_code: 'SH' },
    { country_code: 'AE', name: 'Umm Al Quwain', state_code: 'UQ' },
];

export const STATES_SEED: IStateSeedRow[] = [
    ...INDIA,
    ...UNITED_STATES,
    ...UNITED_ARAB_EMIRATES,
];
