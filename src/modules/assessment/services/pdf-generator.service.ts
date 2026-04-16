import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PdfGeneratorService {
    private readonly outputDir = 'public/files/assessment-report';

    constructor() {
        // Ensure output directory exists
        this.ensureDirectoryExists();
    }

    private ensureDirectoryExists(): void {
        const dir = path.resolve(this.outputDir);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    async generatePdf(
        reportId: string,
        assessmentData: any,
        userDetails: any
    ): Promise<string> {
        try {
            // Dynamic import for puppeteer (if installed)
            const puppeteer = await this.loadPuppeteer();
            if (!puppeteer) {
                throw new Error(
                    'Puppeteer is not installed. Please run: npm install puppeteer'
                );
            }

            const browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                ],
            });

            const page = await browser.newPage();

            // Generate HTML content
            const html = this.generateHtmlContent(assessmentData, userDetails);

            await page.setContent(html, { waitUntil: 'networkidle0' });

            const outputPath = path.resolve(this.outputDir, `${reportId}.pdf`);

            await page.pdf({
                path: outputPath,
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '7mm',
                    bottom: '10.3mm',
                    right: '2mm',
                    left: '2mm',
                },
            });

            await browser.close();

            // Compress PDF if compress-pdf is available
            await this.compressPdf(outputPath);

            return `files/assessment-report/${reportId}.pdf`;
        } catch (error) {
            console.error('Error generating PDF:', error);
            throw new Error(`Failed to generate PDF: ${error.message}`);
        }
    }

    private async loadPuppeteer(): Promise<any> {
        try {
            // @ts-ignore - Dynamic import
            return await import('puppeteer');
        } catch (error) {
            console.warn('Puppeteer not installed');
            return null;
        }
    }

    private async compressPdf(filePath: string): Promise<void> {
        try {
            // @ts-ignore - Dynamic import
            const compressPdf = await import('compress-pdf');
            const buffer = await compressPdf.compress(filePath);
            await fs.promises.writeFile(filePath, buffer);
        } catch (error) {
            console.warn(
                'PDF compression skipped (compress-pdf not installed)'
            );
        }
    }

    private generateHtmlContent(assessmentData: any, userDetails: any): string {
        // Generate HTML for user details
        const userDetailsHtml = this.generateUserDetailsHtml(userDetails);

        // Generate HTML for assessment data
        const assessmentHtml = this.generateAssessmentHtml(assessmentData);

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
    @page {
        margin: 7mm 2mm 10.3mm 2mm;
    }

    body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 20px;
        color: #333;
    }

    .page-break {
        page-break-after: always;
    }

    .header {
        text-align: center;
        margin-bottom: 30px;
        border-bottom: 2px solid #007bff;
        padding-bottom: 10px;
    }

    .header h1 {
        color: #007bff;
        margin: 0;
    }

    .section {
        margin-bottom: 30px;
    }

    .section-title {
        background-color: #007bff;
        color: white;
        padding: 10px;
        font-size: 18px;
        font-weight: bold;
        margin-bottom: 15px;
    }

    .info-row {
        display: flex;
        margin-bottom: 10px;
        padding: 8px;
        border-bottom: 1px solid #eee;
    }

    .info-label {
        font-weight: bold;
        width: 200px;
        color: #555;
    }

    .info-value {
        flex: 1;
        color: #333;
    }

    .question {
        margin-bottom: 20px;
        padding: 15px;
        background-color: #f9f9f9;
        border-left: 4px solid #007bff;
    }

    .question-text {
        font-weight: bold;
        margin-bottom: 10px;
        color: #333;
    }

    .answer {
        padding: 10px;
        background-color: white;
        border: 1px solid #ddd;
        margin-top: 5px;
    }

    /* ===== Options List Styling ===== */
    ul {
        padding-left: 0;
        list-style: none;
        margin-top: 8px;
    }

    ul li {
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        font-size: 14px;
        color: #444;
    }

    ul li label {
        display: flex;
        align-items: center;
        cursor: default;
        font-size: 14px;
        color: #333;
    }

    /* Checkbox & Radio styling (PDF-safe) */
    input[type="checkbox"],
    input[type="radio"] {
        width: 14px;
        height: 14px;
        margin-right: 8px;
        accent-color: #007bff; /* modern browsers */
    }

    /* When accent-color fails (PDF generation fallback) */
    input[type="checkbox"]:checked,
    input[type="radio"]:checked {
        outline: 2px solid #007bff;
    }

    .score-summary {
        background-color: #f0f8ff;
        padding: 20px;
        border-radius: 5px;
        margin-top: 20px;
    }

    .score-item {
        display: inline-block;
        margin: 10px 20px;
        text-align: center;
    }

    .score-value {
        font-size: 24px;
        font-weight: bold;
        color: #007bff;
    }

    .score-label {
        font-size: 14px;
        color: #666;
    }
</style>

</head>
<body>
    <div class="header">
        <h1>Assessment Report</h1>
    </div>
    
    ${userDetailsHtml}
    
    <div class="page-break"></div>
    
    ${assessmentHtml}
</body>
</html>
        `;
    }

    private generateUserDetailsHtml(userDetails: any): string {
        return `
<div class="section">
    <div class="section-title">User Information</div>
    ${userDetails.name ? `<div class="info-row"><div class="info-label">Name:</div><div class="info-value">${userDetails.name}</div></div>` : ''}
    ${userDetails.first_name ? `<div class="info-row"><div class="info-label">First Name:</div><div class="info-value">${userDetails.first_name}</div></div>` : ''}
    ${userDetails.last_name ? `<div class="info-row"><div class="info-label">Last Name:</div><div class="info-value">${userDetails.last_name}</div></div>` : ''}
    ${userDetails.company_name ? `<div class="info-row"><div class="info-label">Company:</div><div class="info-value">${userDetails.company_name}</div></div>` : ''}
    ${userDetails.email ? `<div class="info-row"><div class="info-label">Email:</div><div class="info-value">${userDetails.email}</div></div>` : ''}
    ${userDetails.mobile ? `<div class="info-row"><div class="info-label">Mobile:</div><div class="info-value">${userDetails.mobile}</div></div>` : ''}
    ${userDetails.business_type ? `<div class="info-row"><div class="info-label">Business Type:</div><div class="info-value">${userDetails.business_type}</div></div>` : ''}
    ${userDetails.team_size ? `<div class="info-row"><div class="info-label">Team Size:</div><div class="info-value">${userDetails.team_size}</div></div>` : ''}
    ${userDetails.operation_description ? `<div class="info-row"><div class="info-label">Operations:</div><div class="info-value">${userDetails.operation_description}</div></div>` : ''}
</div>`;
    }

    // ${
    //     userDetails?.score !== undefined
    //         ? `
    // <div class="score-summary">
    //     <div class="score-item">
    //         <div class="score-value">${userDetails?.total || 0}</div>
    //         <div class="score-label">Total Questions</div>
    //     </div>
    //     <div class="score-item">
    //         <div class="score-value">${userDetails?.pass || 0}</div>
    //         <div class="score-label">Passed</div>
    //     </div>
    //     <div class="score-item">
    //         <div class="score-value">${userDetails?.fail || 0}</div>
    //         <div class="score-label">Failed</div>
    //     </div>
    //     <div class="score-item">
    //         <div class="score-value">${userDetails?.score || 0}</div>
    //         <div class="score-label">Score</div>
    //     </div>
    // </div>
    // `
    //         : ''
    // }
    //         `;
    // }

    private generateAssessmentHtml(assessmentData: any): string {
        if (!assessmentData || !Array.isArray(assessmentData)) {
            console.warn('No assessment data available');
            return '<div class="section">No assessment data available</div>';
        }

        //         return assessmentData
        //             .map(
        //                 (section: any) => `
        // <div class="section">
        //     <div class="section-title">${section.name || 'Section'}</div>
        //     ${section.description ? `<p>${section.description}</p>` : ''}

        //     ${
        //         section.questions && Array.isArray(section.questions)
        //             ? section.questions
        //                   .map(
        //                       (question: any, index: number) => `
        //             <div class="question">
        //                 <div class="question-text">${index + 1}. ${question?.question || 'Question'}</div>
        //                 ${question?.description ? `<p style="color: #666; font-size: 14px;">${question?.description}</p>` : ''}
        //                 ${question?.value ? `<div class="answer"><strong>Answer:</strong> ${question?.value}</div>` : '<div class="answer"><strong>Answer:</strong> </div>'}
        //                 ${
        //                     question?.options && Array.isArray(question?.options)
        //                         ? `
        //                     <div style="margin-top: 10px;">
        //                         <strong>Options:</strong>
        //                         <ul>
        //                             ${question?.options.map((opt: any) => `<li><input type="checkbox" />${opt?.value ?? ''}</li>`).join('')}
        //                         </ul>
        //                     </div>
        //                 `
        //                         : ''
        //                 }
        //                 ${
        //                     question?.child_questions &&
        //                     Array.isArray(question?.child_questions) &&
        //                     question?.child_questions.length > 0
        //                         ? `
        //                     <div style="margin-left: 20px; margin-top: 10px;">
        //                         <strong>Sub-questions:</strong>
        //                         ${question?.child_questions
        //                             .map(
        //                                 (child: any, childIndex: number) => `
        //                             <div class="question" style="margin-top: 10px;">
        //                                 <div class="question-text">${index + 1}.${childIndex + 1}. ${child?.question || 'Sub-question'}</div>
        //                                 ${child?.value ? `<div class="answer"><strong>Answer:</strong> ${child?.value}</div>` : ''}
        //                             </div>
        //                         `
        //                             )
        //                             .join('')}
        //                     </div>
        //                 `
        //                         : ''
        //                 }
        //             </div>
        //         `
        //                   )
        //                   .join('')
        //             : '<p>No questions available</p>'
        //     }
        // </div>
        //         `
        //             )
        //             .join('');

        return assessmentData
            .map(
                (section: any) => `
<div class="section">
    <div class="section-title">${section.name || 'Section'}</div>
    ${section.description ? `<p>${section.description}</p>` : ''}
    
    ${
        section.questions && Array.isArray(section.questions)
            ? section.questions
                  .map(
                      (question: any, index: number) => `
            <div class="question">
                <div class="question-text">${index + 1}. ${question?.question || 'Question'}</div>
                ${question?.description ? `<p style="color: #666; font-size: 14px;">${question?.description}</p>` : ''}

                <!-- Answer section -->
                ${
                    question?.answerDetails?.value
                        ? question?.option_type === 'radio'
                            ? ''
                            : question?.option_type === 'checkbox'
                              ? ''
                              : `<div class="answer"><strong>Answer:</strong> ${question?.answerDetails?.value}</div>`
                        : ''
                }

                <!-- Options section (radio / checkbox logic added here) -->
                ${
                    question?.options &&
                    Array.isArray(question?.options) &&
                    (question.option_type === 'radio' ||
                        question.option_type === 'checkbox')
                        ? `
                    <div style="margin-top: 10px;">
                        <strong>Options:</strong>
                        <ul>
                            ${question.options
                                .map((opt: any) => {
                                    // * Radio Button *
                                    if (question.option_type === 'radio') {
                                        const checked =
                                            opt.value?.toString()?.toLowerCase() ===
                                            question?.answerDetails?.value?.toString()?.toLowerCase()
                                                ? 'checked'
                                                : '';
                                        
                                        const listTag =`
                                            <li>
                                                <label>
                                                    <input type="radio" name="${question._id}" value="${opt.value}" ${checked} >
                                                    ${opt.value}
                                                </label>
                                            </li>
                                        `;
                                        return listTag;
                                    }

                                    // * Checkbox group *
                                    if (question.option_type === 'checkbox') {
                                        // const selectedValues = Array.isArray(
                                        //     question?.answerDetails?.value
                                        // )
                                        //     ? question.answerDetails.value
                                        //     : [];

                                        const checked = question?.answerDetails?.value?.includes(
                                            opt.value
                                        )
                                            ? 'checked'
                                            : '';

                                        return `
                                            <li>
                                                <label>
                                                    <input type="checkbox" name="${question.id}" value="${opt.value}" ${checked} />
                                                    ${opt.value}
                                                </label>
                                            </li>
                                        `;
                                    }

                                    // * Default fallback *
                                    return `<li>${opt.value}</li>`;
                                })
                                .join('')}
                        </ul>
                    </div>
                `
                        : ''
                }

                <!-- Child questions -->
                ${
                    question?.child_questions &&
                    Array.isArray(question?.child_questions) &&
                    question?.child_questions.length > 0
                        ? `
                    <div style="margin-left: 20px; margin-top: 10px;">
                        <strong>Sub-questions:</strong>
                        ${question.child_questions
                            .map(
                                (child: any, childIndex: number) => `
                            <div class="question" style="margin-top: 10px;">
                                <div class="question-text">${index + 1}.${childIndex + 1}. ${child?.question || 'Sub-question'}</div>
                                ${
                                    child?.answerDetails?.value
                                        ? `<div class="answer"><strong>Answer:</strong> ${child?.answerDetails?.value}</div>`
                                        : ''
                                }
                            </div>
                        `
                            )
                            .join('')}
                    </div>
                `
                        : ''
                }
            </div>
        `
                  )
                  .join('')
            : '<p>No questions available</p>'
    }
</div>
        `
            )
            .join('');
    }

    async checkPdfExists(reportId: string): Promise<boolean> {
        const filePath = path.resolve(this.outputDir, `${reportId}.pdf`);
        return fs.existsSync(filePath);
    }

    async deletePdf(reportId: string): Promise<void> {
        const filePath = path.resolve(this.outputDir, `${reportId}.pdf`);
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
    }
}
