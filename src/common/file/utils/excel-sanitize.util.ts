/**
 * CSV/Excel formula-injection guard (OWASP) — shared across every place in
 * the app that writes a cell into an exported `.xlsx`/`.csv`.
 *
 * A cell string that OPENS with one of these characters is interpreted as a
 * formula by Excel/Sheets/Calc the moment the file is opened — e.g. an
 * imported vendor/customer/product name or remark of "=1+1" or
 * "=HYPERLINK(...)" re-exported verbatim can execute (including
 * exfiltrating data via WEBSERVICE/HYPERLINK) on whoever opens the file.
 * Prefixing with a bare apostrophe forces Excel to render the cell as
 * literal text instead of evaluating it — the standard mitigation, and
 * invisible in the rendered cell (Excel strips the leading `'` from
 * display). Only applied to STRING values that already start with a risk
 * character, so numeric cells (including negative numbers, stored as JS
 * `number`) are never touched.
 *
 * One shared implementation per CLAUDE.md §1.8 DRY rule — import this
 * rather than re-declaring the character list locally.
 */
const EXCEL_FORMULA_INJECTION_CHARS = ['=', '+', '-', '@', '\t', '\r'];

export function sanitizeExcelCellValue<V>(v: V): V {
    if (
        typeof v === 'string' &&
        v.length > 0 &&
        EXCEL_FORMULA_INJECTION_CHARS.includes(v[0])
    ) {
        return `'${v}` as unknown as V;
    }
    return v;
}

/** Sanitizes an array of row OBJECTS (the shape `xlsx.utils.json_to_sheet` takes). */
export function sanitizeExcelRowObjects<T>(rows: T[]): T[] {
    return rows.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const out: any = Array.isArray(row) ? [] : {};
        for (const key of Object.keys(row as any)) {
            out[key] = sanitizeExcelCellValue((row as any)[key]);
        }
        return out;
    });
}

/** Sanitizes an array-of-arrays (the shape `xlsx.utils.aoa_to_sheet` takes). */
export function sanitizeExcelAoa<T>(rows: T[][]): T[][] {
    return rows.map((row) =>
        Array.isArray(row)
            ? row.map((cell) => sanitizeExcelCellValue(cell))
            : row
    );
}
