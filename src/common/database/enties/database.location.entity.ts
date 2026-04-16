import { ENUM_DATABASE_LOCATION_TYPE } from '@common/database/enums/database.enum';

// Embedded type — used as JSONB in PostgreSQL
export class DatabaseLocationEntity {
    type: ENUM_DATABASE_LOCATION_TYPE;
    coordinates: number[];
}

export type DatabaseLocationDoc = DatabaseLocationEntity;
