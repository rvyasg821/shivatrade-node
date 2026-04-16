export interface IMigrationUserResult {
    email: string;
    success: boolean;
    error?: string;
    userType: string;
    tenantId?: string;
}

export interface IMigrationResult {
    totalProcessed: number;
    successful: number;
    failed: number;
    errors: IMigrationError[];
    results: IMigrationUserResult[];
}

export interface IMigrationError {
    email: string;
    error: string;
    userType: string;
}

export interface IMigrationService {
    migrateExistingUsers(): Promise<IMigrationResult>;
    migrateSuperAdmins(): Promise<IMigrationUserResult[]>;
    migrateCompanyAdmins(): Promise<IMigrationUserResult[]>;
    migrateTenantUsers(): Promise<IMigrationUserResult[]>;
}