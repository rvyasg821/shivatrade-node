import * as XLSXStyle from 'xlsx-js-style';

/**
 * Shared styled-workbook builder for per-document Excel exports.
 *
 * Every document (Quotation, Sales Order, Invoice, Vendor PO, GRN, Debit Note,
 * Receipt, Payment Voucher) exports a single `.xlsx` that MIRRORS its PDF:
 * title banner → party/meta header band → line-items table → tax/totals → notes.
 *
 * This is the ONE place styled Excel is produced. Documents must NOT hand-roll
 * `xlsx-js-style` themselves — they map their already-fetched PDF data object to
 * `DocSection[]` and call `buildDocWorkbook`. Plain `xlsx` cannot carry cell
 * styles, so styled output goes exclusively through here (see build plan §5/§14.6).
 */

// ─── Public types ─────────────────────────────────────────────────────────

export type DocAlign = 'l' | 'r' | 'c';

/** A single typed, styled cell inside a table row. */
export interface DocCell {
    /** Cell value. `null`/`''` renders blank. */
    v: string | number | null;
    /** xlsx cell type — inferred from `typeof v` when omitted. */
    t?: 's' | 'n';
    bold?: boolean;
    align?: DocAlign;
    /** Excel number format, e.g. `'#,##0.00'`. */
    numFmt?: string;
    /** Fill colour (hex, no `#`). */
    fill?: string;
    /** Font colour (hex, no `#`). */
    color?: string;
    /** Merge this cell across N columns (>=2). */
    colSpan?: number;
}

export type DocSection =
    /** Doc-name banner (merged, bold, brand fill) + optional subtitle line. */
    | { kind: 'title'; text: string; subtitle?: string }
    /** A blank spacer row. */
    | { kind: 'spacer' }
    /** Free-text note / terms line. */
    | { kind: 'note'; text: string; bold?: boolean }
    /** Full-width stacked label→value meta rows. */
    | { kind: 'kv'; pairs: Array<[string, string]> }
    /** A single party block (Bill-to / Supplier): bold label then address lines. */
    | { kind: 'party'; label: string; lines: string[] }
    /**
     * Side-by-side header band: party block on the left half, meta grid on the
     * right half — mirrors the PDF's "Supplier | Voucher meta" row.
     */
    | {
          kind: 'band';
          left?: { label?: string; lines: string[] };
          // Right side is EITHER a kv meta grid (`pairs`) OR address lines
          // (`lines`) — the latter renders a second party block beside the left.
          right?: {
              label?: string;
              pairs?: Array<[string, string]>;
              lines?: string[];
          };
      }
    /** Line-items table: bold header row + styled body rows. */
    | {
          kind: 'table';
          head: string[];
          rows: DocCell[][];
          align?: DocAlign[];
      }
    /** Right-aligned totals block; last pair can be emphasised (grand total). */
    | {
          kind: 'totals';
          pairs: Array<[string, string | number]>;
          emphasizeLast?: boolean;
      };

export interface BuildDocWorkbookInput {
    /** Worksheet tab name, e.g. `'Vendor PO'`. */
    sheetName: string;
    sections: DocSection[];
    /** Optional per-column widths (chars). Falls back to a sensible spread. */
    columnWidths?: number[];
}

// ─── Palette (brand-consistent with the costing report / import sheets) ─────

const CLR = {
    brand: 'E2761B', // orange banner + table head
    brandDark: 'C25E10',
    ink: '20303F',
    white: 'FFFFFF',
    muted: '6B7280',
    line: 'D9D9E3',
    zebra: 'F7F7FB',
    bandBg: 'F3F2F7',
    totalBg: 'FDEBD8',
    totalText: 'C25E10',
};

const thin = (rgb: string) => ({ style: 'thin', color: { rgb } });
const boxAll = (rgb: string) => ({
    top: thin(rgb),
    bottom: thin(rgb),
    left: thin(rgb),
    right: thin(rgb),
});
const hAlign = (a?: DocAlign): 'left' | 'right' | 'center' =>
    a === 'r' ? 'right' : a === 'c' ? 'center' : 'left';

// ─── Builder ────────────────────────────────────────────────────────────────

/**
 * Serialise `sections` into a styled single-sheet workbook Buffer.
 * Layout flows top→bottom; the sheet is as wide as the widest table (min 6).
 */
export function buildDocWorkbook(input: BuildDocWorkbookInput): Buffer {
    const { sheetName, sections } = input;

    // Sheet width = widest table header (min 6 so header bands look balanced).
    let width = 6;
    for (const s of sections) {
        if (s.kind === 'table') width = Math.max(width, s.head.length);
    }

    const aoa: (string | number | null)[][] = [];
    // Style ops applied after the sheet exists: (r, c, style).
    const styleOps: Array<{ r: number; c: number; s: any }> = [];
    const merges: XLSXStyle.Range[] = [];

    const pushRow = (row: (string | number | null)[] = []): number => {
        const r = aoa.length;
        const padded = row.slice(0, width);
        while (padded.length < width) padded.push(null);
        aoa.push(padded);
        return r;
    };
    const style = (r: number, c: number, s: any) => styleOps.push({ r, c, s });
    const mergeRow = (r: number, c0: number, c1: number) => {
        if (c1 > c0) merges.push({ s: { r, c: c0 }, e: { r, c: c1 } });
    };

    for (const section of sections) {
        switch (section.kind) {
            case 'spacer': {
                pushRow();
                break;
            }

            case 'title': {
                const r = pushRow([section.text]);
                mergeRow(r, 0, width - 1);
                for (let c = 0; c < width; c++)
                    style(r, c, {
                        fill: {
                            patternType: 'solid',
                            fgColor: { rgb: CLR.brand },
                        },
                        font: {
                            color: { rgb: CLR.white },
                            bold: true,
                            sz: 16,
                        },
                        alignment: { horizontal: 'center', vertical: 'center' },
                    });
                if (section.subtitle) {
                    const sr = pushRow([section.subtitle]);
                    mergeRow(sr, 0, width - 1);
                    for (let c = 0; c < width; c++)
                        style(sr, c, {
                            fill: {
                                patternType: 'solid',
                                fgColor: { rgb: CLR.bandBg },
                            },
                            font: { color: { rgb: CLR.muted }, sz: 10 },
                            alignment: {
                                horizontal: 'center',
                                vertical: 'center',
                            },
                        });
                }
                break;
            }

            case 'note': {
                const r = pushRow([section.text]);
                mergeRow(r, 0, width - 1);
                for (let c = 0; c < width; c++)
                    style(r, c, {
                        font: {
                            color: { rgb: CLR.muted },
                            italic: true,
                            bold: !!section.bold,
                            sz: 10,
                        },
                        alignment: {
                            horizontal: 'left',
                            vertical: 'center',
                            wrapText: true,
                        },
                    });
                break;
            }

            case 'kv': {
                for (const [label, value] of section.pairs) {
                    const r = pushRow([label, value]);
                    mergeRow(r, 1, width - 1);
                    style(r, 0, {
                        font: { color: { rgb: CLR.muted }, bold: true, sz: 10 },
                        alignment: { horizontal: 'left', vertical: 'center' },
                    });
                    for (let c = 1; c < width; c++)
                        style(r, c, {
                            font: { color: { rgb: CLR.ink }, sz: 10 },
                            alignment: { horizontal: 'left', vertical: 'center' },
                        });
                }
                break;
            }

            case 'party': {
                const lr = pushRow([section.label]);
                mergeRow(lr, 0, width - 1);
                for (let c = 0; c < width; c++)
                    style(lr, c, {
                        fill: {
                            patternType: 'solid',
                            fgColor: { rgb: CLR.bandBg },
                        },
                        font: { color: { rgb: CLR.brandDark }, bold: true, sz: 11 },
                        alignment: { horizontal: 'left', vertical: 'center' },
                    });
                for (const line of section.lines) {
                    const r = pushRow([line]);
                    mergeRow(r, 0, width - 1);
                    for (let c = 0; c < width; c++)
                        style(r, c, {
                            font: { color: { rgb: CLR.ink }, sz: 10 },
                            alignment: {
                                horizontal: 'left',
                                vertical: 'center',
                            },
                        });
                }
                break;
            }

            case 'band': {
                const half = Math.max(1, Math.floor(width / 2));
                const left = section.left;
                const right = section.right;
                // Left = address lines (label bold first). Right is EITHER kv
                // pairs (label col + value col) OR address lines (a second
                // party block). Rows are as tall as the taller side.
                const leftLines: Array<{ text: string; bold: boolean }> = [];
                if (left?.label)
                    leftLines.push({ text: left.label, bold: true });
                for (const l of left?.lines || [])
                    leftLines.push({ text: l, bold: false });

                const rightIsLines = !!right?.lines && !right?.pairs;
                type RItem =
                    | { kind: 'kv'; label: string; value: string }
                    | { kind: 'line'; text: string; bold: boolean };
                const rightItems: RItem[] = [];
                if (rightIsLines) {
                    if (right?.label)
                        rightItems.push({
                            kind: 'line',
                            text: right.label,
                            bold: true,
                        });
                    for (const l of right?.lines || [])
                        rightItems.push({ kind: 'line', text: l, bold: false });
                } else {
                    if (right?.label)
                        rightItems.push({
                            kind: 'line',
                            text: right.label,
                            bold: true,
                        });
                    for (const [k, v] of right?.pairs || [])
                        rightItems.push({ kind: 'kv', label: k, value: v });
                }

                const rows = Math.max(leftLines.length, rightItems.length, 1);
                for (let i = 0; i < rows; i++) {
                    const lTxt = leftLines[i]?.text ?? null;
                    const rItem = rightItems[i];
                    const rowVals: (string | number | null)[] = new Array(
                        width
                    ).fill(null);
                    rowVals[0] = lTxt;
                    if (rItem?.kind === 'kv') {
                        rowVals[half] = rItem.label;
                        rowVals[half + 1] = rItem.value;
                    } else if (rItem?.kind === 'line') {
                        rowVals[half] = rItem.text;
                    }
                    const r = pushRow(rowVals);
                    // Left half spans 0..half-1.
                    mergeRow(r, 0, half - 1);
                    style(r, 0, {
                        fill: {
                            patternType: 'solid',
                            fgColor: { rgb: CLR.bandBg },
                        },
                        font: {
                            color: {
                                rgb: leftLines[i]?.bold ? CLR.brandDark : CLR.ink,
                            },
                            bold: !!leftLines[i]?.bold,
                            sz: leftLines[i]?.bold ? 11 : 10,
                        },
                        alignment: { horizontal: 'left', vertical: 'center' },
                    });
                    for (let c = 1; c < half; c++)
                        style(r, c, {
                            fill: {
                                patternType: 'solid',
                                fgColor: { rgb: CLR.bandBg },
                            },
                        });
                    if (rItem?.kind === 'kv') {
                        // Right: label col bold-muted, value spans to the end.
                        style(r, half, {
                            font: {
                                color: { rgb: CLR.muted },
                                bold: true,
                                sz: 10,
                            },
                            alignment: {
                                horizontal: 'left',
                                vertical: 'center',
                            },
                        });
                        mergeRow(r, half + 1, width - 1);
                        for (let c = half + 1; c < width; c++)
                            style(r, c, {
                                font: { color: { rgb: CLR.ink }, sz: 10 },
                                alignment: {
                                    horizontal: 'left',
                                    vertical: 'center',
                                },
                            });
                    } else if (rItem?.kind === 'line') {
                        // Right party block: the whole right half is one line.
                        mergeRow(r, half, width - 1);
                        for (let c = half; c < width; c++)
                            style(r, c, {
                                fill: {
                                    patternType: 'solid',
                                    fgColor: { rgb: CLR.bandBg },
                                },
                                font: {
                                    color: {
                                        rgb: rItem.bold ? CLR.brandDark : CLR.ink,
                                    },
                                    bold: rItem.bold,
                                    sz: rItem.bold ? 11 : 10,
                                },
                                alignment: {
                                    horizontal: 'left',
                                    vertical: 'center',
                                },
                            });
                    } else {
                        // No right item this row — keep the right half clean.
                        for (let c = half; c < width; c++) style(r, c, {});
                    }
                }
                break;
            }

            case 'table': {
                const cols = section.head.length;
                const align = section.align || [];
                // Header row.
                const hr = pushRow(section.head);
                for (let c = 0; c < cols; c++)
                    style(hr, c, {
                        fill: {
                            patternType: 'solid',
                            fgColor: { rgb: CLR.brand },
                        },
                        font: { color: { rgb: CLR.white }, bold: true, sz: 11 },
                        alignment: {
                            horizontal: hAlign(align[c] || 'c'),
                            vertical: 'center',
                            wrapText: true,
                        },
                        border: boxAll(CLR.brandDark),
                    });
                // Body rows (zebra striped).
                for (let ri = 0; ri < section.rows.length; ri++) {
                    const cells = section.rows[ri];
                    const rowVals: (string | number | null)[] = [];
                    for (let c = 0; c < cols; c++)
                        rowVals.push(cells[c] ? cells[c].v : null);
                    const r = pushRow(rowVals);
                    const zebra = ri % 2 ? CLR.zebra : CLR.white;
                    let c = 0;
                    while (c < cols) {
                        const cell = cells[c];
                        const span = cell?.colSpan && cell.colSpan > 1 ? cell.colSpan : 1;
                        if (span > 1) mergeRow(r, c, Math.min(cols, c + span) - 1);
                        style(r, c, {
                            fill: {
                                patternType: 'solid',
                                fgColor: { rgb: cell?.fill || zebra },
                            },
                            font: {
                                color: { rgb: cell?.color || CLR.ink },
                                bold: !!cell?.bold,
                                sz: 10,
                            },
                            alignment: {
                                horizontal: hAlign(cell?.align || align[c] || 'l'),
                                vertical: 'center',
                                wrapText: true,
                            },
                            border: boxAll(CLR.line),
                            ...(cell?.numFmt ? { numFmt: cell.numFmt } : {}),
                        });
                        c += span;
                    }
                }
                break;
            }

            case 'totals': {
                const labelStart = Math.max(0, width - 3);
                const valueCol = width - 1;
                const last = section.pairs.length - 1;
                for (let i = 0; i < section.pairs.length; i++) {
                    const [label, value] = section.pairs[i];
                    const emphasise = section.emphasizeLast && i === last;
                    const rowVals: (string | number | null)[] = new Array(
                        width
                    ).fill(null);
                    rowVals[labelStart] = label;
                    rowVals[valueCol] = value;
                    const r = pushRow(rowVals);
                    mergeRow(r, labelStart, valueCol - 1);
                    const fill = emphasise ? CLR.totalBg : CLR.white;
                    for (let c = labelStart; c <= valueCol; c++)
                        style(r, c, {
                            fill: {
                                patternType: 'solid',
                                fgColor: { rgb: fill },
                            },
                            font: {
                                color: {
                                    rgb: emphasise ? CLR.totalText : CLR.ink,
                                },
                                bold: emphasise || c === labelStart,
                                sz: emphasise ? 12 : 10,
                            },
                            alignment: {
                                horizontal: c === valueCol ? 'right' : 'right',
                                vertical: 'center',
                            },
                            border: emphasise
                                ? {
                                      top: thin(CLR.brandDark),
                                      bottom: thin(CLR.brandDark),
                                  }
                                : { top: thin(CLR.line) },
                            ...(typeof value === 'number' && c === valueCol
                                ? { numFmt: '#,##0.00' }
                                : {}),
                        });
                }
                break;
            }
        }
    }

    // Build the worksheet from the value grid, then paint styles.
    const ws = XLSXStyle.utils.aoa_to_sheet(aoa);
    for (const { r, c, s } of styleOps) {
        const ref = XLSXStyle.utils.encode_cell({ r, c });
        if (!ws[ref]) ws[ref] = { t: 's', v: '' };
        // Preserve numeric typing when the value grid produced a number.
        ws[ref].s = s;
    }
    if (merges.length) ws['!merges'] = merges;

    // Column widths — caller override, else col 0 wide (labels) + even spread.
    if (input.columnWidths && input.columnWidths.length) {
        ws['!cols'] = input.columnWidths.map((wch) => ({ wch }));
    } else {
        ws['!cols'] = Array.from({ length: width }, (_, c) => ({
            wch: c === 0 ? 26 : c === 1 ? 22 : 14,
        }));
    }

    const workbook = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(
        workbook,
        ws,
        (sheetName || 'Sheet1').slice(0, 31)
    );
    return XLSXStyle.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
    }) as Buffer;
}

/**
 * `<voucher>.xlsx` filename, sanitised the same way the PDF filenames are so an
 * Excel download sits beside its PDF sibling with only the extension changed.
 */
export function buildExcelFilename(voucherNo: string, fallback = 'Document'): string {
    const safe = (voucherNo || fallback)
        .replace(/[\\/]+/g, '-')
        .replace(/[^A-Za-z0-9_\-.]/g, '');
    return `${safe || fallback}.xlsx`;
}

/** Convenience: format a number as a fixed-2 money cell value. */
export function moneyCell(
    v: number,
    opts?: { bold?: boolean; color?: string; fill?: string }
): DocCell {
    return {
        v: Number.isFinite(v) ? Number(v) : 0,
        t: 'n',
        align: 'r',
        numFmt: '#,##0.00',
        bold: opts?.bold,
        color: opts?.color,
        fill: opts?.fill,
    };
}

/**
 * Currency cell — numeric (so Excel can sum/format) but displays the currency
 * symbol suffix like the PDF (e.g. `1,188.0000 $`). `dp` decimals, default 2.
 */
export function curCell(
    v: number,
    sym: string,
    dp = 2,
    opts?: { bold?: boolean; color?: string; fill?: string }
): DocCell {
    const decimals = dp > 0 ? '.' + '0'.repeat(dp) : '';
    const suffix = sym ? ` "${sym}"` : '';
    return {
        v: Number.isFinite(v) ? Number(v) : 0,
        t: 'n',
        align: 'r',
        numFmt: `#,##0${decimals}${suffix}`,
        bold: opts?.bold,
        color: opts?.color,
        fill: opts?.fill,
    };
}

/** Convenience: a plain text cell. */
export function textCell(
    v: string | number | null,
    align: DocAlign = 'l',
    opts?: { bold?: boolean; color?: string }
): DocCell {
    return { v, align, bold: opts?.bold, color: opts?.color };
}
