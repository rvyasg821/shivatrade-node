/**
 * Format a location row into a frozen multi-line snapshot text suitable
 * for printing on a PO/POV PDF "Deliver to" block.
 *
 * Used by the PO + POV services when a user picks a location via
 * `LocationSelect`; the resulting text is stored on the generated
 * document and never re-derived.
 */
export function formatLocationAddress(loc: any): string {
    if (!loc) return '';
    const lines: string[] = [];
    const heading = [loc.name, loc.code ? `[${loc.code}]` : null]
        .filter(Boolean)
        .join(' ');
    if (heading) lines.push(heading);
    if (loc.address_line1) lines.push(String(loc.address_line1));
    if (loc.address_line2) lines.push(String(loc.address_line2));

    const cityLine = [loc.city, loc.state, loc.postcode]
        .filter(Boolean)
        .join(', ')
        .replace(/, (\d)/, ' $1'); // postcode joins with space, not comma
    if (cityLine) lines.push(cityLine);

    if (loc.country) lines.push(String(loc.country));

    return lines.join('\n');
}
