import { BadRequestException, Logger } from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { FileService } from '@common/file/services/file.service';
import { IFile } from '@common/file/interfaces/file.interface';

/**
 * The parts every master importer repeats.
 *
 * Category and UOM each grew their own copy of the same six steps — read the
 * sheet, check the header, read a cell, validate, summarise, write. Countries,
 * States and Cities would have made five copies, so the loop lives here once
 * and each master supplies only the part that is actually about that master:
 * its columns, its validation rules and its create/update calls.
 *
 * Everything below was lifted VERBATIM from `category.import-export.service.ts`
 * so the retrofit provably changes no behaviour. The only additions are the
 * optional row cap (§15 D-12) and the multi-column header assertion, neither of
 * which fires unless a caller asks for it.
 */

export type ImportRowStatus = 'valid_new' | 'valid_update' | 'error';

/** One parsed sheet row, before anything is written. */
export interface MasterImportRow<T> {
    /** 1-indexed sheet row, header included — what the user sees in Excel. */
    rowNum: number;
    data: T;
    status: ImportRowStatus;
    existingId?: string;
    errors: string[];
}

export interface ImportSummary {
    total: number;
    valid_new: number;
    valid_update: number;
    errors: number;
}

export interface MasterImportResult {
    created: number;
    updated: number;
    errors: { row: number; message: string }[];
}

/**
 * Read the first sheet of an uploaded file.
 *
 * Only file-level problems throw — an unreadable file, no data rows, or (when
 * `maxRows` is given) more rows than the preview can carry back to the browser.
 * Row-level problems are never raised here; they belong on the row.
 */
export function readSheetRows(
    fileService: FileService,
    fileBuffer: Buffer,
    options?: { maxRows?: number; headers?: string[] }
): Record<string, any>[] {
    let sheets;
    try {
        sheets = fileService.readExcel(fileBuffer);
    } catch {
        throw new BadRequestException(
            'Unable to read the file. Please upload a valid Excel or CSV file.'
        );
    }

    const rawRows = (sheets?.[0]?.data || []) as Record<string, any>[];
    if (!rawRows.length) {
        // Zero rows has two very different causes and the old message only
        // described one of them. A file whose header row was deleted parses to
        // zero rows too, because its first DATA row silently becomes the
        // header — so "the file contains no data" is exactly the wrong thing to
        // tell someone staring at a sheet full of data.
        const expected = options?.headers?.length
            ? ` The first row must be the header: ${options.headers.join(', ')}.`
            : ' The first row must be the header row.';
        throw new BadRequestException(
            `The file has no data rows to import.${expected} Data starts on row 2.`
        );
    }

    const max = options?.maxRows;
    if (max && rawRows.length > max) {
        throw new BadRequestException(
            `The file has ${rawRows.length} rows; the limit is ${max}. Please split it into smaller files.`
        );
    }

    return rawRows;
}

/**
 * Fail early when the sheet is missing a column nothing can be done without.
 *
 * Header keys are compared case-insensitively and trimmed, matching the cell
 * reader below — a column typed as " Name " is the `name` column.
 */
export function assertRequiredHeader(
    rawRows: Record<string, any>[],
    required: string[],
    allHeaders: string[]
): void {
    const headerKeys = Object.keys(rawRows[0]).map((k) =>
        k.trim().toLowerCase()
    );
    const missing = required.filter((c) => !headerKeys.includes(c));
    if (!missing.length) return;

    const cols = missing.map((c) => `"${c}"`).join(', ');
    throw new BadRequestException(
        `Missing required column${
            missing.length > 1 ? 's' : ''
        } ${cols}. Expected columns: ${allHeaders.join(', ')}.`
    );
}

/**
 * Case-insensitive column access for one raw row.
 *
 * Strips outer whitespace (including non-breaking spaces) and collapses
 * internal runs of whitespace to a single space — Excel cells often arrive with
 * pasted padding or `&nbsp;` from Word that `.trim()` alone misses.
 */
export function cellReader(
    raw: Record<string, any>
): (col: string) => string {
    return (col: string): string => {
        const key = Object.keys(raw).find(
            (k) => k.trim().toLowerCase() === col
        );
        if (!key) return '';
        return String(raw[key] ?? '')
            .replace(/ /g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };
}

/** Counts for the preview banner. */
export function summarise<T>(rows: MasterImportRow<T>[]): ImportSummary {
    return {
        total: rows.length,
        valid_new: rows.filter((r) => r.status === 'valid_new').length,
        valid_update: rows.filter((r) => r.status === 'valid_update').length,
        errors: rows.filter((r) => r.status === 'error').length,
    };
}

/**
 * Resolve a match key against the existing rows.
 *
 * Returns the row's status and, on a hit, the id to update. A key that matches
 * more than one existing record is refused rather than resolved arbitrarily
 * (§15 D-14): the geo tables were seeded before case-insensitive matching
 * existed, so `Gujarat` and `gujarat` can both be sitting there.
 */
export function resolveMatch<E extends { _id: any }>(
    key: string,
    index: Map<string, E[]>,
    label: string
): { existingId?: string; error?: string } {
    const hits = index.get(key);
    if (!hits?.length) return {};
    if (hits.length > 1) {
        return {
            error: `${label} matches more than one existing record — clean up the master first`,
        };
    }
    return { existingId: hits[0]._id.toString() };
}

/**
 * Build the lookup used by `resolveMatch`. Values are arrays, not single rows,
 * precisely so a collision is visible instead of being silently overwritten by
 * whichever row happened to come last.
 */
export function indexBy<E>(
    rows: E[],
    keyOf: (row: E) => string
): Map<string, E[]> {
    const index = new Map<string, E[]>();
    for (const row of rows) {
        const key = keyOf(row);
        if (!key) continue;
        const bucket = index.get(key);
        if (bucket) bucket.push(row);
        else index.set(key, [row]);
    }
    return index;
}

/**
 * Persist validated rows. One bad row never aborts the batch — it is logged,
 * collected, and the loop moves on, because a 400-row file that dies on row 7
 * is worse than useless to whoever has to fix it.
 *
 * Rows already marked `error` are skipped; the caller is expected to have
 * filtered them, but skipping again costs nothing and closes the gap if a
 * caller forgets.
 */
export async function runMasterImport<T>(
    rows: MasterImportRow<T>[],
    handlers: {
        create: (row: MasterImportRow<T>) => Promise<unknown>;
        update: (row: MasterImportRow<T>, existingId: string) => Promise<unknown>;
    },
    logger: Logger
): Promise<MasterImportResult> {
    let created = 0;
    let updated = 0;
    const errors: { row: number; message: string }[] = [];

    for (const row of rows) {
        if (row.status === 'error') continue;

        try {
            if (row.status === 'valid_update' && row.existingId) {
                await handlers.update(row, row.existingId);
                updated++;
            } else {
                await handlers.create(row);
                created++;
            }
        } catch (err) {
            logger.error(`Import row ${row.rowNum} failed: ${err.message}`);
            errors.push({ row: row.rowNum, message: err.message });
        }
    }

    return { created, updated, errors };
}

const XLSX_MIME =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Stream a generated workbook back as a download. */
export function sendExcel(
    res: ExpressResponse,
    buffer: Buffer,
    filename: string
): void {
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(buffer);
}

/** `masters-2026-07-22.xlsx` — the export naming every module already uses. */
export function datedFilename(prefix: string): string {
    return `${prefix}-${new Date().toISOString().split('T')[0]}.xlsx`;
}

/** Whatever readable text a BadRequestException is carrying. */
function extractMessage(err: BadRequestException): string {
    const body = err.getResponse() as any;
    if (typeof body === 'string') return body;
    if (typeof body?.message === 'string') return body.message;
    if (Array.isArray(body?.message)) return body.message.join(' ');
    return err.message || 'The file could not be read.';
}

/**
 * A file the importer cannot work with at all.
 *
 * Deliberately a 200 carrying `fileError`, not a 4xx: the shared ImportModal
 * renders it in place on the upload step, and it cannot be lost to whatever
 * sits between the app and the browser.
 */
function fileErrorResponse(message: string) {
    return {
        statusCode: 200,
        message,
        data: {
            fileError: message,
            summary: { total: 0, valid_new: 0, valid_update: 0, errors: 0 },
            rows: [],
        },
    };
}

/**
 * The two-pass import endpoint, which is identical for every master:
 * `?preview=true` validates and returns the rows untouched, anything else
 * validates and then writes the rows that survived.
 *
 * Keeping it here means a fix to the preview contract lands on all five
 * importers at once instead of four of them.
 */
export async function handleImportRequest<T>(
    file: IFile,
    preview: string | undefined,
    parse: () => Promise<{ summary: ImportSummary; rows: MasterImportRow<T>[] }>,
    commit: (rows: MasterImportRow<T>[]) => Promise<MasterImportResult>
) {
    if (!file) return fileErrorResponse('No file provided.');

    let summary: ImportSummary;
    let rows: MasterImportRow<T>[];
    try {
        ({ summary, rows } = await parse());
    } catch (err) {
        // A bad FILE (unreadable, no header, no rows, too big) is a normal
        // outcome of the preview step, not an exceptional one — the user is
        // going to fix the sheet and try again. Reporting it as 200 + payload
        // rather than a 4xx means the browser always gets a readable answer,
        // instead of depending on how the error response survives the trip.
        if (err instanceof BadRequestException) {
            return fileErrorResponse(extractMessage(err));
        }
        throw err;
    }

    if (preview === 'true') {
        return {
            statusCode: 200,
            message: 'Preview',
            data: { summary, rows },
        };
    }

    const validRows = rows.filter((r) => r.status !== 'error');
    if (validRows.length === 0) {
        return {
            statusCode: 200,
            message: 'No valid rows to import',
            data: { summary, created: 0, updated: 0, errors: [] },
        };
    }

    const result = await commit(validRows);

    return {
        statusCode: 200,
        message: `Import complete: ${result.created} created, ${result.updated} updated`,
        data: { summary, ...result },
    };
}
