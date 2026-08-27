import { IsArray, IsOptional, IsString } from 'class-validator';

// Mirrors exactly what ErpDashboard.js has already rendered on screen — the
// export endpoints style/paginate this into a file, they never recompute any
// business figure themselves. Keeps the export a WYSIWYG copy of the page
// (single source of truth = the frontend's already-derived cards) instead of
// duplicating the dozen stats calls the dashboard makes to assemble them.
export class DashboardExportCardDto {
    @IsString()
    label: string;

    @IsString()
    value: string;

    @IsOptional()
    @IsString()
    sub?: string;
}

export class DashboardExportCustomerRowDto {
    @IsString()
    name: string;

    @IsString()
    invoices: string;

    @IsString()
    amount: string;
}

export class DashboardExportProductRowDto {
    @IsString()
    name: string;

    @IsString()
    qty: string;

    @IsString()
    amount: string;
}

export class DashboardExportRequestDto {
    @IsString()
    companyName: string;

    @IsOptional()
    @IsString()
    locationName?: string;

    @IsString()
    periodLabel: string;

    @IsArray()
    kpis: DashboardExportCardDto[];

    @IsArray()
    attention: DashboardExportCardDto[];

    @IsArray()
    counts: DashboardExportCardDto[];

    @IsArray()
    topCustomers: DashboardExportCustomerRowDto[];

    @IsArray()
    topProducts: DashboardExportProductRowDto[];
}
