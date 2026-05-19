/**
 * Format a company_addresses row into a frozen multi-line snapshot
 * text suitable for printing on a PO/POV PDF "Deliver to" block.
 *
 * Used by the PO + POV services when a user picks a company address
 * via `CompanyAddressSelect`; the resulting text is stored on the
 * generated document and never re-derived (matches the
 * snapshot-immutability requirement in PO_DELIVERY_ADDRESS_REFACTOR_PLAN
 * §"Snapshot format").
 */
export function formatCompanyAddress(addr: any): string {
    if (!addr) return '';
    const lines: string[] = [];
    if (addr.label) lines.push(String(addr.label));
    if (addr.address_line1) lines.push(String(addr.address_line1));
    if (addr.address_line2) lines.push(String(addr.address_line2));

    const cityLine = [
        addr.city,
        addr.state,
        addr.postcode,
    ]
        .filter(Boolean)
        .join(', ')
        .replace(/, (\d)/, ' $1'); // postcode joins with space, not comma
    if (cityLine) lines.push(cityLine);

    if (addr.country) lines.push(String(addr.country));
    if (addr.gstin) lines.push(`GSTIN: ${addr.gstin}`);

    return lines.join('\n');
}
