import { ENUM_PORT_TYPE } from '../enums/port-master.enum';

export interface IndiaPortSeedRow {
    code: string;
    name: string;
    type: ENUM_PORT_TYPE;
    state?: string;
}

/**
 * ICEGATE customs codes seeded by `seed:port-master` (idempotent upsert by code).
 * Source: ICEGATE customs directory + GST port code listings (approved 2026-05-26).
 *
 * To add more: append rows here and re-run `yarn migrate:seed-ports`. The seed
 * is idempotent - existing rows update; new ones insert.
 */
export const INDIA_PORTS_SEED: IndiaPortSeedRow[] = [
    // Gujarat
    { code: 'INMUN1', name: 'Mundra Port', type: ENUM_PORT_TYPE.SEA, state: 'Gujarat' },
    { code: 'INKDL1', name: 'Kandla (Deendayal Port)', type: ENUM_PORT_TYPE.SEA, state: 'Gujarat' },
    { code: 'INKDL6', name: 'Kandla SEZ', type: ENUM_PORT_TYPE.SEZ, state: 'Gujarat' },
    { code: 'INPAV1', name: 'Pipavav Port', type: ENUM_PORT_TYPE.SEA, state: 'Gujarat' },
    { code: 'INAMD4', name: 'Ahmedabad Air Cargo', type: ENUM_PORT_TYPE.AIR, state: 'Gujarat' },
    { code: 'INAMD5', name: 'Ahmedabad ICD', type: ENUM_PORT_TYPE.ICD, state: 'Gujarat' },
    { code: 'INBRC6', name: 'Baroda ICD (Vadodara)', type: ENUM_PORT_TYPE.ICD, state: 'Gujarat' },
    { code: 'INAKV6', name: 'Ankleshwar ICD', type: ENUM_PORT_TYPE.ICD, state: 'Gujarat' },
    { code: 'INBHU1', name: 'Bhavnagar Port', type: ENUM_PORT_TYPE.SEA, state: 'Gujarat' },
    { code: 'INBED1', name: 'Bedi Port', type: ENUM_PORT_TYPE.SEA, state: 'Gujarat' },
    { code: 'INALA1', name: 'Alang Ship Breaking Yard', type: ENUM_PORT_TYPE.SEA, state: 'Gujarat' },

    // Maharashtra
    { code: 'INNSA1', name: 'Jawaharlal Nehru Port (Nhava Sheva/JNPT)', type: ENUM_PORT_TYPE.SEA, state: 'Maharashtra' },
    { code: 'INBOM1', name: 'Mumbai Sea Port', type: ENUM_PORT_TYPE.SEA, state: 'Maharashtra' },
    { code: 'INBOM4', name: 'Mumbai Air Cargo', type: ENUM_PORT_TYPE.AIR, state: 'Maharashtra' },
    { code: 'INABG1', name: 'Alibag Port', type: ENUM_PORT_TYPE.SEA, state: 'Maharashtra' },

    // Tamil Nadu
    { code: 'INMAA1', name: 'Chennai Sea Port', type: ENUM_PORT_TYPE.SEA, state: 'Tamil Nadu' },
    { code: 'INMAA4', name: 'Chennai Air Cargo', type: ENUM_PORT_TYPE.AIR, state: 'Tamil Nadu' },
    { code: 'INTUT1', name: 'Tuticorin (V.O. Chidambaranar Port)', type: ENUM_PORT_TYPE.SEA, state: 'Tamil Nadu' },
    { code: 'INKAT1', name: 'Kattupalli Port', type: ENUM_PORT_TYPE.SEA, state: 'Tamil Nadu' },
    { code: 'INENR1', name: 'Ennore (Kamarajar Port)', type: ENUM_PORT_TYPE.SEA, state: 'Tamil Nadu' },

    // Andhra Pradesh
    { code: 'INVTZ1', name: 'Visakhapatnam Sea Port', type: ENUM_PORT_TYPE.SEA, state: 'Andhra Pradesh' },
    { code: 'INVTZ4', name: 'Visakhapatnam Air Cargo', type: ENUM_PORT_TYPE.AIR, state: 'Andhra Pradesh' },
    { code: 'INVTZ6', name: 'Visakhapatnam SEZ', type: ENUM_PORT_TYPE.SEZ, state: 'Andhra Pradesh' },
    { code: 'INKRI1', name: 'Krishnapatnam Port', type: ENUM_PORT_TYPE.SEA, state: 'Andhra Pradesh' },
    { code: 'INKAK1', name: 'Kakinada Port', type: ENUM_PORT_TYPE.SEA, state: 'Andhra Pradesh' },
    { code: 'INMAP1', name: 'Machilipatnam Port', type: ENUM_PORT_TYPE.SEA, state: 'Andhra Pradesh' },

    // Kerala
    { code: 'INCOK1', name: 'Cochin Port', type: ENUM_PORT_TYPE.SEA, state: 'Kerala' },
    { code: 'INAZK1', name: 'Azhikkal Port', type: ENUM_PORT_TYPE.SEA, state: 'Kerala' },
    { code: 'INCCJ1', name: 'Kozhikode Port', type: ENUM_PORT_TYPE.SEA, state: 'Kerala' },
    { code: 'INVZJ1', name: 'Vizhinjam Port', type: ENUM_PORT_TYPE.SEA, state: 'Kerala' },

    // West Bengal
    { code: 'INCCU1', name: 'Kolkata Sea Port', type: ENUM_PORT_TYPE.SEA, state: 'West Bengal' },
    { code: 'INCCU4', name: 'Kolkata Air Cargo', type: ENUM_PORT_TYPE.AIR, state: 'West Bengal' },
    { code: 'INHAL1', name: 'Haldia Port', type: ENUM_PORT_TYPE.SEA, state: 'West Bengal' },
    { code: 'INIXB4', name: 'Bagdogra Airport', type: ENUM_PORT_TYPE.AIR, state: 'West Bengal' },

    // Odisha
    { code: 'INPRT1', name: 'Paradip Port', type: ENUM_PORT_TYPE.SEA, state: 'Odisha' },

    // Karnataka
    { code: 'INBLR4', name: 'Bangalore Air Cargo', type: ENUM_PORT_TYPE.AIR, state: 'Karnataka' },
    { code: 'INBLR5', name: 'Bangalore ICD', type: ENUM_PORT_TYPE.ICD, state: 'Karnataka' },
    { code: 'INIXE1', name: 'New Mangalore Port', type: ENUM_PORT_TYPE.SEA, state: 'Karnataka' },

    // Telangana
    { code: 'INHYD4', name: 'Hyderabad Air Cargo', type: ENUM_PORT_TYPE.AIR, state: 'Telangana' },

    // Delhi
    { code: 'INDEL4', name: 'Delhi Air Cargo (IGI)', type: ENUM_PORT_TYPE.AIR, state: 'Delhi' },

    // Punjab
    { code: 'INASR6', name: 'Amritsar', type: ENUM_PORT_TYPE.SEZ, state: 'Punjab' },

    // Tripura
    { code: 'INAGTB', name: 'Agartala', type: ENUM_PORT_TYPE.AIR, state: 'Tripura' },

    // Andaman & Nicobar
    { code: 'INIXZ1', name: 'Port Blair Sea Port', type: ENUM_PORT_TYPE.SEA, state: 'Andaman & Nicobar' },
    { code: 'INIXZ4', name: 'Port Blair Airport', type: ENUM_PORT_TYPE.AIR, state: 'Andaman & Nicobar' },

    // Goa
    { code: 'INMRM1', name: 'Mormugao Port', type: ENUM_PORT_TYPE.SEA, state: 'Goa' },

    // Puducherry
    { code: 'INPON1', name: 'Puducherry Port', type: ENUM_PORT_TYPE.SEA, state: 'Puducherry' },
];
