import { Injectable } from '@nestjs/common';
import { ContractSectionEntity } from '../repository/entities/contract-section.entity';
import { ENUM_PAGINATION_ORDER_DIRECTION_TYPE } from '@common/pagination/enums/pagination.enum';

export interface PlaceholderData {
    // Contract
    contractId?: string;
    effectiveDate?: string;
    endDate?: string;
    todayDate?: string;
    issuedDate?: string;

    // Employee — basic
    employeeName?: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    homeTelephone?: string;
    employeeCode?: string;
    designation?: string;
    department?: string;
    startDate?: string;
    dateOfBirth?: string;

    // Employee — personal
    niNumber?: string;
    nationality?: string;
    maritalStatus?: string;
    employeeAddress?: string;

    // Employee — salary & working
    salary?: string;
    hourlyRate?: string;
    weeklyHours?: string;
    payrollFrequency?: string;
    workingPattern?: string;

    // Employee — bank & pension
    bankName?: string;
    sortCode?: string;
    accountNumber?: string;
    pensionProvider?: string;

    // Employee — emergency contact
    kinName?: string;
    kinRelationship?: string;
    kinPhone?: string;

    // Location
    branchName?: string;
    locationName?: string;

    // Company
    companyName?: string;
    companyCode?: string;
    companyRegistration?: string;
    companyVat?: string;
    companyAddress?: string;
    payeReference?: string;
    companyPension?: string;

    /** Renders an empty signature box at issuance; replaced with <img> on sign */
    employeeSignature?: string;
    [key: string]: string | undefined;
}

@Injectable()
export class ContractPlaceholderService {
    /**
     * Replaces all {{token}} occurrences in HTML with real values.
     */
    replace(html: string, data: PlaceholderData): string {
        if (!html) return '';
        let result = html;
        for (const [key, value] of Object.entries(data)) {
            const safeValue = value ?? '';
            result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), safeValue);
        }
        return result;
    }

    /**
     * Build the placeholder data map from employee/company/location context.
     */
    buildData(
        contractId: string,
        user: any,
        company: any,
        location?: any,
        contractMeta?: { effectiveDate?: string; endDate?: string },
    ): PlaceholderData {
        const firstName = user?.first_name || '';
        const middleName = user?.middle_name || '';
        const lastName = user?.last_name || '';
        const today = new Date().toLocaleDateString('en-GB');
        const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-GB') : '';

        const companyAddress = [
            company?.address_1 || company?.address_line1,
            company?.address_2 || company?.address_line2,
            company?.city,
            company?.zipcode || company?.postcode,
        ].filter(Boolean).join(', ');

        const employeeAddress = [
            user?.address_line1,
            user?.address_line2,
            user?.city,
            user?.state,
            user?.postcode,
        ].filter(Boolean).join(', ');

        const employeeSignature =
            '<div class="signature-placeholder" style="margin-top:20px;padding:16px;border:1px solid #ddd;background:#fafafa;">' +
            '<strong>Employee Signature:</strong><br/>' +
            '<div class="signature-box" style="border-bottom:1px solid #333;width:300px;height:60px;margin-top:8px;">&nbsp;</div>' +
            '</div>';

        return {
            // Contract
            contractId,
            effectiveDate: fmtDate(contractMeta?.effectiveDate),
            endDate: contractMeta?.endDate ? fmtDate(contractMeta.endDate) : 'Permanent',
            todayDate: today,
            issuedDate: today,

            // Employee — basic
            employeeName: `${firstName} ${middleName} ${lastName}`.replace(/\s+/g, ' ').trim(),
            firstName,
            middleName,
            lastName,
            email: user?.email || '',
            phone: user?.mobile || user?.phone || '',
            homeTelephone: user?.home_telephone || '',
            employeeCode: user?.employee_code || '',
            designation: user?.designation || '',
            department: user?.department || '',
            startDate: fmtDate(user?.date_of_joining || user?.start_date),
            dateOfBirth: fmtDate(user?.date_of_birth),

            // Employee — personal
            niNumber: user?.ni_number || '',
            nationality: user?.nationality || '',
            maritalStatus: user?.marital_status || '',
            employeeAddress,

            // Employee — salary & working
            salary: (user?.annual_salary || user?.salary || '').toString(),
            hourlyRate: user?.hourly_rate != null ? String(user.hourly_rate) : '',
            weeklyHours: user?.weekly_working_hours != null ? String(user.weekly_working_hours) : '',
            payrollFrequency: user?.payroll_frequency || '',
            workingPattern: user?.working_hours_pattern || '',

            // Employee — bank & pension
            bankName: user?.bank_name || '',
            sortCode: user?.sort_code || '',
            accountNumber: user?.account_number || '',
            pensionProvider: user?.pension_provider || '',

            // Employee — emergency contact
            kinName: user?.kin_name || '',
            kinRelationship: user?.kin_relationship || '',
            kinPhone: user?.kin_phone || '',

            // Location
            branchName: location?.location_name || '',
            locationName: location?.location_name || '',

            // Company
            companyName: company?.company_name || company?.name || '',
            companyCode: company?.company_code || '',
            companyRegistration: company?.license_number || company?.registration_number || '',
            companyVat: company?.tax_number || company?.vat_number || '',
            companyAddress,
            payeReference: company?.paye_reference || '',
            companyPension: company?.pension_provider || '',

            employeeSignature,
        };
    }

    /**
     * Renders all sections into a single HTML string with placeholders replaced.
     * Returns the full rendered HTML of the contract document body.
     */
    renderSections(sections: ContractSectionEntity[], data: PlaceholderData): string {
        const sorted = [...sections]
            .filter(s => s.is_active !== false)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        const parts = sorted.map(section => {
            const body = this.replace(section.rich_text_body || '', data);
            const titleHtml = section.title
                ? `<h2 class="contract-section-title">${section.title}</h2>`
                : '';
            return `<div class="contract-section">${titleHtml}<div class="contract-section-body">${body}</div></div>`;
        });

        return parts.join('\n');
    }

    /**
     * Builds the complete HTML document for PDF/view rendering.
     * The signature is embedded inline via the {{employeeSignature}} placeholder
     * in the template sections — no standalone signature block is appended here.
     */
    buildHtmlDocument(
        renderedSections: string,
        companyName: string,
        companyFooter: string,
        branding?: {
            logoUrl?: string;
            companyDisplayName?: string;
            footerAddress?: string;
            footerContact?: string;
            footerExtra?: string;
        },
    ): string {
        const displayName = branding?.companyDisplayName || companyName;
        const logoHtml = branding?.logoUrl
            ? `<img src="${branding.logoUrl}" alt="${displayName}" style="max-height: 60px;" />`
            : '';

        // Build footer text — all parts in one centered line separated by |
        const footerParts: string[] = [displayName];
        if (branding?.footerAddress) footerParts.push(branding.footerAddress);
        if (branding?.footerContact) footerParts.push(branding.footerContact);
        if (branding?.footerExtra) footerParts.push(branding.footerExtra);
        if (footerParts.length === 1 && companyFooter) footerParts.push(companyFooter);
        const footerText = footerParts.join(' | ');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: #222;
    margin: 0;
    padding: 0;
  }
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 40px 12px;
    border-bottom: 2px solid #333;
    margin-bottom: 24px;
  }
  .page-header-left { display: flex; align-items: center; }
  .page-header-left img { max-height: 60px; }
  .page-header-right { text-align: right; }
  .page-header-right h1 { font-size: 18px; margin: 0; white-space: nowrap; }
  .content { padding: 0 40px; }
  .contract-section { margin-bottom: 20px; }
  .contract-section-title {
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    border-bottom: 1px solid #ddd;
    padding-bottom: 4px;
    margin-bottom: 8px;
  }
  .contract-section-body { line-height: 1.6; }
  .contract-section-body p { margin: 6px 0; }
  .data-box {
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px 12px;
    margin: 8px 0;
  }
  .data-box strong { display: block; font-size: 11px; color: #555; }
  .signature-placeholder { display: block; }
  .signature-box { height: 60px; border-bottom: 1px solid #333; width: 300px; margin-top: 8px; }
  .signature-signed { display: block; margin-top: 8px; }
  .signature-signed img { max-width: 300px; border: 1px solid #eee; background: #fff; }
  .signed-date { color: #555; font-size: 11px; margin-top: 4px; }
  .page-footer {
    text-align: center;
    border-top: 1px solid #ccc;
    font-size: 10px;
    color: #777;
    padding: 8px 40px;
    margin-top: 30px;
  }
</style>
</head>
<body>
  <div class="page-header">
    <div class="page-header-left">${logoHtml}</div>
    <div class="page-header-right"><h1>${displayName}</h1></div>
  </div>
  <div class="content">
    ${renderedSections}
  </div>
  <div class="page-footer">${footerText}</div>
</body>
</html>`;
    }
}
