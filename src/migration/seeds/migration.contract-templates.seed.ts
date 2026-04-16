import { Injectable } from '@nestjs/common';
import { Command } from 'nestjs-command';
import { ContractTemplateRepository } from '@modules/contract/repository/repositories/contract-template.repository';
import { ContractSectionRepository } from '@modules/contract/repository/repositories/contract-section.repository';

// ─────────────────────────────────────────────────────────────────────────────
// Standard UK Employment Contract — System Template
// company_id: null  |  is_system: true
//
// Sections use {{token}} placeholders that get replaced at issuance time.
// Available tokens:
//   {{contractId}}  {{employeeName}}  {{firstName}}  {{lastName}}
//   {{email}}  {{phone}}  {{designation}}  {{department}}
//   {{startDate}}  {{salary}}  {{employeeCode}}
//   {{branchName}}  {{locationName}}  {{todayDate}}  {{issuedDate}}
//   {{companyName}}  {{companyRegistration}}  {{companyVat}}  {{companyAddress}}
// ─────────────────────────────────────────────────────────────────────────────

interface SectionDef {
    title: string;
    description?: string;
    rich_text_body: string;
    order: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 1: Standard Full-time Employment Contract (UK)
// ─────────────────────────────────────────────────────────────────────────────
const FULLTIME_CONTRACT_SECTIONS: SectionDef[] = [
    {
        title: '',
        description: 'Contract header — summary fields',
        order: 0,
        rich_text_body: `
<table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
  <tr>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px; width:50%;">
      <strong>Contract Reference</strong><br/>{{contractId}}
    </td>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px; width:50%;">
      <strong>Branch / Location</strong><br/>{{branchName}}
    </td>
  </tr>
  <tr>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px;">
      <strong>Employee Name</strong><br/>{{employeeName}}
    </td>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px;">
      <strong>Employee Code</strong><br/>{{employeeCode}}
    </td>
  </tr>
  <tr>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px;">
      <strong>Date of Issue</strong><br/>{{issuedDate}}
    </td>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px;">
      <strong>Email</strong><br/>{{email}}
    </td>
  </tr>
</table>

<h2 style="font-size:16px; border-bottom:2px solid #333; padding-bottom:6px; margin-top:10px;">Contract of Employment</h2>
<p>This letter is your contract of employment and contains a statement of the applicable terms of your employment as required by section 1 of the Employment Rights Act 1996.</p>
<p>This contract is between <strong>{{companyName}}</strong> (the "Company") and <strong>{{employeeName}}</strong> (the "Employee").</p>
`,
    },
    {
        title: '1. COMMENCEMENT OF EMPLOYMENT',
        order: 1,
        rich_text_body: `
<p>1.1 Your employer is <strong>{{companyName}}</strong>. Your employment with the Company commences on <strong>{{startDate}}</strong>. No employment with a previous employer counts towards your period of continuous employment with the Company.</p>

<p>1.2 The first three months of your employment shall be a probationary period and your employment may be terminated during this period at any time on one week's prior notice. We may, at our discretion, extend this period for up to a further three months. During this probationary period your performance and suitability for continued employment will be monitored. At the end of your probationary period you will be informed in writing if you have successfully completed your probationary period.</p>

<p>1.3 You, as an employee, are agreeing for one year to work for {{companyName}}. You may leave your job after giving four weeks' notice once you finish the contract term (one year from the date of contract, i.e. the Start Date field above). Living job within this specified one year of time may be charged under section 'Training and Repayment Costs'. You shall be notified each month, if you have participated or asked to participate in any training. However, in some unforeseen circumstances such as maternity, partial or full disability, this clause shall not be applied.</p>
`,
    },
    {
        title: '2. JOB TITLE',
        order: 2,
        rich_text_body: `
<p>2.1 Your employed designation post is: <strong style="background:#f5f5f5; padding:2px 8px; border:1px solid #ddd; display:inline-block;">{{designation}}</strong>. You should report to your line manager. Your duties are set out in the attached job description.</p>

<p>2.2 You may be required to undertake other duties from time to time as we may reasonably require.</p>

<p>2.3 You warrant that you are entitled to work in the UK without any additional approvals and will notify the Company immediately if you cease to be so entitled at any time during your employment with the Company.</p>

<p>2.4 You warrant that where your employment with the Company is dependent upon the possession of particular qualifications and/or registration with a statutory body or other Authority you are in possession of the particular qualifications and/or registered with the relevant statutory body or other Authority. The Company may at any time require you to produce evidence of this. Failure to provide such evidence may amount to a potential disciplinary offence.</p>

<p>2.5 You shall not work for anyone else while you are employed by the Company without the prior consent of the Company. This means that you undertake not to:</p>
<ul>
  <li>2.5.1 Work for any third party, including but not limited to clients and customers of the Company;</li>
  <li>2.5.2 Undertake any work on a private or self-employed basis; or</li>
  <li>2.5.3 Solicit clients or customers of the Company.</li>
</ul>
`,
    },
    {
        title: '3. PLACE OF WORK',
        order: 3,
        rich_text_body: `
<p>3.1 Your place of work is: <strong style="background:#f5f5f5; padding:2px 8px; border:1px solid #ddd; display:inline-block;">{{companyName}} ({{branchName}})</strong></p>

<p>3.2 The Company may require you to work at any other location, whether on a temporary or permanent basis, in the UK or elsewhere. In such circumstances the Company will give reasonable advance notice.</p>
`,
    },
    {
        title: '4. UNIFORM',
        order: 4,
        rich_text_body: `
<p>4.1 Where appropriate you will be provided with a uniform. You will contribute 50% towards the cost of this uniform to be deducted from your first month's salary.</p>

<p>4.2 You are expected to wear the Company uniform at all times during working hours. The uniform remains the property of the Company and must be returned upon termination of your employment.</p>
`,
    },
    {
        title: '5. SALARY',
        order: 5,
        rich_text_body: `
<p>5.1 Your basic salary / hourly rate is: <strong style="background:#f5f5f5; padding:2px 8px; border:1px solid #ddd; display:inline-block;">{{salary}}</strong></p>
<p>Your salary shall be paid on a monthly basis in arrears on or about the last working day of each month directly into your bank or building society account.</p>

<p>5.2 From time to time you may be given the opportunity to work extra hours in addition to your normal weekly hours and beyond the additional hours necessary for the proper performance of your duties as specified in clause 6.1 of this agreement. For the avoidance of doubt you will have no right to overtime. The rate of pay in respect of any extra hours worked in addition to your normal weekly hours and beyond the additional hours necessary for the proper performance of your duties as specified in clause 6.1 of this agreement will be the same as that specified in clause 5.1.</p>

<p>5.3 We shall be entitled to deduct from your salary or other payments due to you any money which you may owe to the Company at any time. Such deductions may be made in respect of:</p>
<ul>
  <li>(a) Clothing provided to you by the Company which is lost, damaged, or destroyed;</li>
  <li>(b) Tools and equipment provided by the Company which require replacement or repair as a result of your actions, beyond normal wear and tear;</li>
  <li>(c) Any outstanding monies you owe to the Company from your pay or on termination of your employment from your final pay;</li>
  <li>(d) The cost of personal indemnity insurance in respect of your employment with the Company.</li>
</ul>
`,
    },
    {
        title: '6. HOURS OF WORK AND RULES',
        order: 6,
        rich_text_body: `
<p>6.1 Your contracted hours of work are as agreed with your line manager and set out in your offer letter. Your working days may include weekends. The Company will notify you of the rota shift system on a weekly basis. You may be required to work such additional hours as may be necessary for the proper performance of your duties at your current rate.</p>

<p>6.2 Your normal weekly hours are as stated in your offer letter. Your hours of work will be organised according to a rota shift system. Notice will be given issuing 7 days prior to contracted Hours Amendment.</p>

<p>6.3 Where the total length of your shift exceeds six hours you will be entitled to an unpaid rest break of 30 minutes. Where the total length of your shift exceeds 12 hours you will be entitled to a further unpaid rest break of 20 minutes.</p>
`,
    },
    {
        title: '7. SHORT-TIME WORKING AND LAY OFF',
        order: 7,
        rich_text_body: `
<p>7.1 The Company reserves the right to introduce short-time working or a period of temporary lay off without pay (with the exception of any statutory entitlement) where this is necessary to avoid redundancies or where there is a shortage of work.</p>

<p>7.2 In the event of short-time working or lay off, the Company will use its reasonable endeavours to provide you with as much advance notice as is reasonably practicable in the circumstances.</p>
`,
    },
    {
        title: '8. HOLIDAYS',
        order: 8,
        rich_text_body: `
<p>8.1 You are entitled to 28 days' holiday <strong>(for full time employees)</strong> during each holiday year. This includes bank holidays and public holidays. The Company's holiday year runs between 6 April and 5 April. If your employment starts or finishes part way through the holiday year, your holiday entitlement during that year shall be calculated on a pro-rata basis.</p>

<p>8.2 You shall give at least two weeks' notice of any proposed holiday dates where the proposed period of holiday is up to two days' duration and these must be agreed by your line manager in writing in advance. Where the proposed period of holiday exceeds two days' duration you shall give at least four weeks' notice of the proposed dates and these must be agreed by your manager in writing in advance. No more than ten days' holiday may be taken at any one time unless prior consent is obtained. We may require you to take holiday on specific days as notified to you.</p>

<p>8.3 You cannot carry untaken holiday entitlement forward from one holiday year to the following holiday year unless a period of sickness, statutory maternity, paternity or adoption leave has prevented you from taking it in the relevant year.</p>

<p>8.4 We shall not pay you in lieu of untaken holiday except on termination of employment. The amount of such payment in lieu shall be 1/260th of your salary for each untaken day of your entitlement under clause 8.1.</p>

<p>8.5 If you have taken more holiday than your accrued entitlement at the date your employment terminates, we shall be entitled to deduct from any payments due to you one day's pay calculated at 1/260th of your full-time equivalent salary for each excess day.</p>

<p>8.6 During any continuous period of absence due to incapacity of one month or more you shall not accrue contractual holiday under this contract.</p>
`,
    },
    {
        title: '9. SICKNESS ABSENCE',
        order: 9,
        rich_text_body: `
<p>9.1 If you are absent from work for any reason, you must notify your line manager of the reason for your absence as soon as possible but no later than two hours before your normal start time on the first day of absence. The Company does not accept email or text messages as notification of absence.</p>

<p>9.2 In all cases of absence a self-certification form, which is available from your manager, must be completed on your return to work and supplied to your manager. For any period of incapacity due to sickness or injury which lasts for seven consecutive days or more, a doctor's certificate stating the reason for absence must be obtained at your own cost and supplied to your manager. Further certificates must be obtained if the absence continues for longer than the period of the original certificate.</p>

<p>9.3 You agree to consent to a medical examination (at our expense) by a doctor nominated by the Company should the Company so require. You agree that any report produced in connection with any such examination may be disclosed to the Company and the Company may discuss the contents of the report with the relevant doctor.</p>

<p>9.4 If you are absent from work we shall pay you <strong>Statutory Sick Pay (SSP)</strong> provided that you satisfy the relevant requirements. Your qualifying days for SSP purposes are Monday to Saturday.</p>
`,
    },
    {
        title: '10. TERMINATION AND NOTICE PERIOD',
        order: 10,
        rich_text_body: `
<p>10.1 After successful completion of your probationary period as provided in clause 1.2, and subject to clause 10.2, the prior written notice required from the Company to terminate your employment shall be as follows:</p>
<ul>
  <li>(a) One week's prior written notice until you have been continuously employed for two complete years; and</li>
  <li>(b) One additional week's notice for each completed year of continuous employment thereafter up to a maximum of 12 weeks' notice.</li>
</ul>

<p>10.2 We shall be entitled to dismiss you at any time without notice or payment in lieu of notice if you commit a serious breach of your obligations as an employee, or if you cease to be entitled to work in the United Kingdom.</p>

<p>10.3 In the event that you terminate your employment with the Company you are required to give the Company four weeks' prior written notice.</p>
`,
    },
    {
        title: '11. DISCIPLINARY AND GRIEVANCE PROCEDURES',
        order: 11,
        rich_text_body: `
<p>11.1 In the event that you need to resolve a grievance you should put details in writing and send these to your line manager.</p>

<p>11.2 If you wish to appeal against a grievance or a disciplinary decision you may apply in writing to the Company director in accordance with our non-contractual procedure.</p>

<p>11.3 We reserve the right to suspend you with pay for a period of no longer than two weeks for the purposes of investigating any allegation of misconduct or neglect against you.</p>

<p>11.4 Details of the Company's disciplinary and grievance procedures are set out in the Company's Employee Handbook, which is available from your manager.</p>
`,
    },
    {
        title: '12. PENSIONS',
        order: 12,
        rich_text_body: `
<p>12.1 The Company operates an auto-enrolment pension scheme applicable to your employment, which you may be eligible to join. Full details of the scheme can be obtained from your line manager.</p>

<p>12.2 A contracting-out certificate is not in force in respect of your employment.</p>
`,
    },
    {
        title: '13. COLLECTIVE AGREEMENT',
        order: 13,
        rich_text_body: `
<p>13.1 There is no collective agreement which directly affects your employment.</p>
`,
    },
    {
        title: '14. CHANGES TO YOUR TERMS OF EMPLOYMENT',
        order: 14,
        rich_text_body: `
<p>14.1 We reserve the right to make reasonable changes to any of your terms of employment. You will be notified in writing of any change as soon as possible and in any event within one month of the change.</p>
`,
    },
    {
        title: '15. TRAINING COSTS',
        order: 15,
        rich_text_body: `
<p>15.1 From time to time the Company may pay for you to attend training courses. For the avoidance of doubt, you will not receive salary in respect of any period during which you have been training. In consideration of this, you agree that if your employment terminates after the Company has incurred liability for the cost of you doing so you will be liable to repay some or all of the fees, expenses and other costs ("the Costs") associated with such training courses.</p>

<p>15.2 Except in the circumstances set out below, you agree to repay the Company as follows:</p>
<ul>
  <li>(a) If you cease employment before you attend the training course but the Company has already incurred liability for the Costs — 100% of the Costs;</li>
  <li>(b) If you cease employment during the training course or within 12 months of completing the training course — 100% of the Costs;</li>
  <li>(c) If you cease employment more than 12 months but no more than 24 months after completion of the training course — 50% of the Costs;</li>
  <li>(d) If you cease employment more than 24 months but no more than 36 months after completion — 25% of the Costs.</li>
</ul>

<p>15.3 You shall not be required to repay any of the Costs if: (a) the Company terminates your employment, except where it was entitled to and did terminate your employment summarily; or (b) you terminate your employment in response to a fundamental breach by the Company.</p>
`,
    },
    {
        title: '16. CONFIDENTIAL INFORMATION',
        order: 16,
        rich_text_body: `
<p>16.1 You shall not use or disclose either directly or indirectly to any person either during or at any time after your employment with the Company any confidential information about the business or affairs of the Company or any of its business contacts or clients, or about any other matters which may come to your knowledge in the course of your employment. For the purposes of this clause, <strong>confidential information</strong> means any information or matter which is not in the public domain and which relates to the affairs of the Company or any of its business contacts or clients.</p>

<p>16.2 Examples of confidential information include, but are not limited to: information relating to business methods; corporate plans; finances; business opportunities and development projects; trade secrets; client lists and client information; pricing and commercial strategies.</p>

<p>16.3 Any unauthorised use or disclosure of confidential information during your employment will be regarded as gross misconduct and could result in your summary dismissal without notice or pay in lieu of notice.</p>

<p>16.4 The restriction in clause 16.1 does not apply to:</p>
<ul>
  <li>(a) Prevent you from making a protected disclosure within the meaning of section 43A of the Employment Rights Act 1996; or</li>
  <li>(b) Use or disclosure that has been authorised by the Company, is required by law or by your employment.</li>
</ul>
`,
    },
    {
        title: '17. RESTRICTIVE COVENANTS',
        order: 17,
        rich_text_body: `
<p>17.1 You agree that the Company is entitled to take reasonable steps to protect and preserve its customer connections and goodwill, confidential information, supplier connections, and the stability of its workforce. Accordingly you undertake that you will not:</p>

<ul>
  <li>17.1.1 For the first three months after the end of your employment, within 900 yards of your normal place of work, engage in any trade or business in competition with the Company in which you were materially involved during the last twelve months of your employment;</li>
  <li>17.1.2 For the first six months after the end of your employment, directly or indirectly solicit orders for services in competition with the Company from any of the Company's customers with whom you dealt during the last twelve months of your employment;</li>
  <li>17.1.3 For the first six months after the end of your employment, directly or indirectly accept orders for services in competition with the Company from any of the Company's customers with whom you dealt during the last twelve months of your employment;</li>
  <li>17.1.4 For the first nine months after the end of your employment, directly or indirectly solicit or entice away from the Company any person who is and was, when your employment ended, employed by the Company during the last twelve months of your employment;</li>
  <li>17.1.5 For the first six months after the end of your employment, directly or indirectly interfere with the relationship between the Company and any supplier, distributor or authorised agent with whom you had material dealings during the last twelve months of your employment.</li>
</ul>

<p>17.2 Each of the above restrictions is separate and severable from the other. If one is unenforceable for any reason, but would be enforceable if some of its wording were deleted, it shall apply with such deletions as are necessary to make it enforceable.</p>
`,
    },
    {
        title: '18. COMPANY PROPERTY',
        order: 18,
        rich_text_body: `
<p>18.1 All documents, manuals, hardware and software provided for your use, and any data or documents (including copies) produced, maintained or stored on the Company's computer systems or other electronic equipment (including mobile phones), remain the property of the Company.</p>

<p>18.2 Any Company property in your possession and any original or copy documents obtained by you in the course of your employment shall be returned to the Company at any time on request and in any event prior to the termination of your employment.</p>
`,
    },
    {
        title: '19. INVENTIONS AND INTELLECTUAL PROPERTY',
        order: 19,
        rich_text_body: `
<p>19.1 You will promptly disclose to the Company and keep confidential all inventions, copyright works, designs or technical know-how conceived or made by you alone or with others in the course of your employment. All such intellectual property will vest in and belong to the Company absolutely and you will do everything necessary or desirable at the Company's expense to vest the intellectual property fully in the Company and/or to secure patent or other appropriate forms of protection for the intellectual property.</p>
`,
    },
    {
        title: '20. HEALTH AND SAFETY',
        order: 20,
        rich_text_body: `
<p>20.1 The Company regards the health, safety and welfare of its employees and of anyone who may be affected by its activities as an important consideration. All employees have the responsibility to cooperate with the management to achieve a healthy and safe workplace and to take reasonable care of themselves and others.</p>

<p>20.2 You are required to gain an understanding of the Company's health and safety procedures, observe them, and ensure that safety equipment and clothing are always used. The Company's health and safety information is displayed on the Company's premises.</p>
`,
    },
    {
        title: '21. SECURITY',
        order: 21,
        rich_text_body: `
<p>21.1 The Company reserves the right to stop, search, and detain any individual whilst engaged on Company business or on Company property whether suspected of a criminal offence or as part of a periodic security check. Refusal to comply with Company security procedures may amount to a disciplinary offence.</p>
`,
    },
    {
        title: '22. INSURANCE',
        order: 22,
        rich_text_body: `
<p>22.1 As an employee of the Company you may require personal indemnity insurance in order to properly carry out your role. The Company agrees to arrange and bear the initial cost of personal indemnity insurance. You agree to 50% of the cost of your personal indemnity insurance being deducted from your salary on a monthly basis at a rate to be specified at the discretion of the Company.</p>
`,
    },
    {
        title: '23. SMOKING',
        order: 23,
        rich_text_body: `
<p>23.1 Smoking is strictly prohibited anywhere on Company premises.</p>
`,
    },
    {
        title: '24. PERSONAL MOBILE TELEPHONES',
        order: 24,
        rich_text_body: `
<p>24.1 You must ensure that your personal mobile telephone is switched off at all times during working hours. You should only use your mobile telephone during authorised break times. Failure to observe this rule may result in disciplinary action.</p>
`,
    },
    {
        title: '25. THIRD PARTY RIGHTS',
        order: 25,
        rich_text_body: `
<p>25.1 The Contracts (Rights of Third Parties) Act 1999 shall not apply to this agreement. No person other than you and the Company shall have any rights under this agreement and this agreement shall not be enforceable by any person other than you and the Company.</p>
`,
    },
    {
        title: '26. RECORD KEEPING AND DATA PROTECTION',
        order: 26,
        rich_text_body: `
<p>26.1 In order to maintain accurate personnel files, the Company may need to record certain personal information about you including your racial or ethnic origin, your religious beliefs, whether you are a member of a trade union and details of your physical or mental health or condition. You hereby consent to the Company doing so. This information will be kept strictly confidential and will not be disclosed without your consent or save as required or permitted by applicable data protection legislation.</p>

<p>26.2 The Company processes personal data in accordance with its Privacy Policy and the UK General Data Protection Regulation (UK GDPR). You may request a copy of the Privacy Policy from your manager.</p>
`,
    },
    {
        title: 'ACCEPTANCE OF TERMS',
        order: 27,
        rich_text_body: `
<p style="margin-top:20px;"><strong>Please indicate your acceptance of these terms by signing and returning to your manager.</strong></p>

<table style="width:100%; margin-top:20px;">
  <tr>
    <td style="width:50%; padding:12px; border:1px solid #ddd; background:#f9f9f9;">
      <strong>Employee Name:</strong><br/>{{employeeName}}
    </td>
    <td style="width:50%; padding:12px; border:1px solid #ddd; background:#f9f9f9;">
      <strong>Date:</strong><br/>{{issuedDate}}
    </td>
  </tr>
</table>

{{employeeSignature}}
`,
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 2: Zero Hours Contract (UK)
// ─────────────────────────────────────────────────────────────────────────────
const ZERO_HOURS_CONTRACT_SECTIONS: SectionDef[] = [
    {
        title: '',
        description: 'Zero Hours contract header',
        order: 0,
        rich_text_body: `
<table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
  <tr>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px; width:50%;">
      <strong>Contract Reference</strong><br/>{{contractId}}
    </td>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px; width:50%;">
      <strong>Branch / Location</strong><br/>{{branchName}}
    </td>
  </tr>
  <tr>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px;">
      <strong>Employee Name</strong><br/>{{employeeName}}
    </td>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px;">
      <strong>Date of Issue</strong><br/>{{issuedDate}}
    </td>
  </tr>
</table>

<h2 style="font-size:16px; border-bottom:2px solid #333; padding-bottom:6px;">Zero Hours Contract of Employment</h2>
<p>This agreement is entered into between <strong>{{companyName}}</strong> (the "Company") and <strong>{{employeeName}}</strong> (the "Worker").</p>
<p>This is a zero hours contract. The Company is under no obligation to offer you any minimum number of hours of work, and you are under no obligation to accept any hours offered.</p>
`,
    },
    {
        title: '1. ENGAGEMENT',
        order: 1,
        rich_text_body: `
<p>1.1 The Company engages you on a zero hours basis as <strong>{{designation}}</strong> with effect from <strong>{{startDate}}</strong>.</p>

<p>1.2 As a zero hours worker, the Company is under no obligation to offer you work, and you are under no obligation to accept any work offered. When work is offered and accepted, the terms set out in this agreement will apply.</p>

<p>1.3 Your place of work when engaged will be <strong>{{companyName}}</strong> ({{branchName}}) or such other location as the Company may reasonably require.</p>
`,
    },
    {
        title: '2. PAY AND WORKING HOURS',
        order: 2,
        rich_text_body: `
<p>2.1 You will be paid at a rate of <strong>{{salary}}</strong> per hour for each hour worked. Payment will be made monthly in arrears directly into your bank or building society account.</p>

<p>2.2 The Company will offer you work as and when it becomes available. You are free to accept or decline any offers of work without penalty.</p>

<p>2.3 You are not permitted to work for a competitor of the Company during any period that you are carrying out work for the Company without prior written consent.</p>

<p>2.4 Where a shift offered and accepted exceeds six hours you will be entitled to an unpaid rest break of 30 minutes.</p>
`,
    },
    {
        title: '3. HOLIDAY ENTITLEMENT',
        order: 3,
        rich_text_body: `
<p>3.1 You are entitled to paid holiday in accordance with the Working Time Regulations 1998. Your holiday entitlement will accrue at the rate of 12.07% of hours worked.</p>

<p>3.2 Requests for holiday must be made to your manager at least one week in advance for periods of up to one week, and at least one month in advance for longer periods.</p>

<p>3.3 Holiday pay will be calculated based on your average earnings over the previous 52 working weeks (or fewer if you have not worked for 52 weeks).</p>
`,
    },
    {
        title: '4. SICKNESS AND ABSENCE',
        order: 4,
        rich_text_body: `
<p>4.1 If you are unable to attend work you must notify your manager as soon as possible on the first day of absence. You may be entitled to Statutory Sick Pay (SSP) if you meet the eligibility requirements.</p>

<p>4.2 During periods when the Company has not offered you work and you have not accepted any work, SSP provisions do not apply.</p>
`,
    },
    {
        title: '5. TERMINATION',
        order: 5,
        rich_text_body: `
<p>5.1 Either party may terminate this agreement on one week's written notice.</p>

<p>5.2 During any period in which work has been offered and accepted, the notice provisions apply. When no work is being carried out, no notice is required to end the general engagement.</p>
`,
    },
    {
        title: '6. CONFIDENTIALITY AND CONDUCT',
        order: 6,
        rich_text_body: `
<p>6.1 You shall not use or disclose any confidential information about the Company, its clients or business acquired during the course of your engagement.</p>

<p>6.2 You are expected to comply with the Company's policies and procedures (including health and safety, equal opportunities and data protection) during any periods of engagement.</p>
`,
    },
    {
        title: '7. DATA PROTECTION',
        order: 7,
        rich_text_body: `
<p>7.1 The Company will hold and process personal data about you in accordance with UK GDPR and its Privacy Policy. By entering into this contract you consent to the Company processing your data for legitimate employment purposes.</p>
`,
    },
    {
        title: 'ACCEPTANCE OF TERMS',
        order: 8,
        rich_text_body: `
<p style="margin-top:20px;"><strong>I acknowledge and accept the terms of this zero hours contract.</strong></p>

<table style="width:100%; margin-top:20px;">
  <tr>
    <td style="width:50%; padding:12px; border:1px solid #ddd; background:#f9f9f9;">
      <strong>Worker Name:</strong><br/>{{employeeName}}
    </td>
    <td style="width:50%; padding:12px; border:1px solid #ddd; background:#f9f9f9;">
      <strong>Date:</strong><br/>{{issuedDate}}
    </td>
  </tr>
</table>

{{employeeSignature}}
`,
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 3: Fixed-term Contract (UK)
// ─────────────────────────────────────────────────────────────────────────────
const FIXED_TERM_CONTRACT_SECTIONS: SectionDef[] = [
    {
        title: '',
        description: 'Fixed-term contract header',
        order: 0,
        rich_text_body: `
<table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
  <tr>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px; width:50%;">
      <strong>Contract Reference</strong><br/>{{contractId}}
    </td>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px; width:50%;">
      <strong>Branch / Location</strong><br/>{{branchName}}
    </td>
  </tr>
  <tr>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px;">
      <strong>Employee Name</strong><br/>{{employeeName}}
    </td>
    <td style="background:#f5f5f5; border:1px solid #ddd; padding:8px 12px;">
      <strong>Start Date</strong><br/>{{startDate}}
    </td>
  </tr>
</table>

<h2 style="font-size:16px; border-bottom:2px solid #333; padding-bottom:6px;">Fixed-Term Contract of Employment</h2>
<p>This contract is between <strong>{{companyName}}</strong> (the "Company") and <strong>{{employeeName}}</strong> (the "Employee").</p>
<p>This is a fixed-term contract. Your employment will automatically terminate at the end of the fixed term unless the Company agrees in writing to extend or make it permanent.</p>
`,
    },
    {
        title: '1. COMMENCEMENT AND DURATION',
        order: 1,
        rich_text_body: `
<p>1.1 Your employment commences on <strong>{{startDate}}</strong> and is for a fixed term ending on the date specified in your offer letter (the "End Date"), unless extended or terminated earlier in accordance with this agreement.</p>

<p>1.2 Your employment will automatically terminate on the End Date without any further notice being required, unless the Company agrees in writing to extend the fixed term or to offer you permanent employment.</p>

<p>1.3 The first month of employment shall be a probationary period. The Company may terminate your employment during this period on one week's notice.</p>
`,
    },
    {
        title: '2. JOB TITLE AND DUTIES',
        order: 2,
        rich_text_body: `
<p>2.1 Your job title is <strong>{{designation}}</strong>. You will report to your line manager and your duties are set out in the attached job description.</p>

<p>2.2 You may be required to carry out other duties as reasonably required by the Company from time to time.</p>
`,
    },
    {
        title: '3. SALARY AND HOURS',
        order: 3,
        rich_text_body: `
<p>3.1 Your salary is <strong>{{salary}}</strong> per annum (or as agreed hourly rate), paid monthly in arrears.</p>

<p>3.2 Your working hours are as set out in your offer letter. You may be required to work additional hours as necessary for the proper performance of your duties.</p>
`,
    },
    {
        title: '4. HOLIDAY AND SICK PAY',
        order: 4,
        rich_text_body: `
<p>4.1 You will accrue holiday on a pro-rata basis in accordance with the duration of your fixed term, calculated at 28 days per year (including bank holidays) for a full-time employee.</p>

<p>4.2 You may be entitled to Statutory Sick Pay during your employment, subject to the eligibility requirements.</p>
`,
    },
    {
        title: '5. EARLY TERMINATION',
        order: 5,
        rich_text_body: `
<p>5.1 Either party may terminate this contract before the End Date by giving four weeks' written notice, unless the reason for termination is gross misconduct, in which case the Company may dismiss without notice.</p>

<p>5.2 Upon expiry or early termination, all Company property must be returned immediately.</p>
`,
    },
    {
        title: '6. GENERAL TERMS',
        order: 6,
        rich_text_body: `
<p>6.1 Clauses relating to confidentiality, intellectual property, health and safety, and conduct (as set out in the Standard Employment Contract terms) apply equally to this fixed-term contract and are incorporated herein by reference.</p>

<p>6.2 UK GDPR and data protection obligations apply throughout the duration of this contract and survive its termination.</p>
`,
    },
    {
        title: 'ACCEPTANCE OF TERMS',
        order: 7,
        rich_text_body: `
<p style="margin-top:20px;"><strong>I acknowledge and accept the terms of this fixed-term contract.</strong></p>

<table style="width:100%; margin-top:20px;">
  <tr>
    <td style="width:50%; padding:12px; border:1px solid #ddd; background:#f9f9f9;">
      <strong>Employee Name:</strong><br/>{{employeeName}}
    </td>
    <td style="width:50%; padding:12px; border:1px solid #ddd; background:#f9f9f9;">
      <strong>Date:</strong><br/>{{issuedDate}}
    </td>
  </tr>
</table>

{{employeeSignature}}
`,
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Template Registry
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_TEMPLATES = [
    {
        slug: 'standard-fulltime-uk',
        name: 'Standard Full-time Employment Contract (UK)',
        description: 'Comprehensive standard employment contract for full-time employees in the UK. Covers all statutory requirements under the Employment Rights Act 1996. Contains 26 sections including commencement, salary, hours, holiday, sickness, termination, confidentiality, and restrictive covenants.',
        requires_signature: true,
        sections: FULLTIME_CONTRACT_SECTIONS,
    },
    {
        slug: 'zero-hours-uk',
        name: 'Zero Hours Contract (UK)',
        description: 'Zero hours/casual worker contract for the UK. No guaranteed minimum hours. Suitable for casual, bank staff or flexible workers.',
        requires_signature: true,
        sections: ZERO_HOURS_CONTRACT_SECTIONS,
    },
    {
        slug: 'fixed-term-uk',
        name: 'Fixed-term Employment Contract (UK)',
        description: 'Fixed-term employment contract with defined end date. Includes early termination provisions, pro-rata holiday, and standard UK employment terms.',
        requires_signature: true,
        sections: FIXED_TERM_CONTRACT_SECTIONS,
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seed Class
// ─────────────────────────────────────────────────────────────────────────────
@Injectable()
export class MigrationContractTemplatesSeed {
    constructor(
        private readonly templateRepository: ContractTemplateRepository,
        private readonly sectionRepository: ContractSectionRepository,
    ) {}

    @Command({
        command: 'seed:contract-templates',
        describe: 'Seed system-level UK contract templates (Full-time, Zero Hours, Fixed-term)',
    })
    async seed(): Promise<void> {
        try {
            console.log('=== Contract Templates Seed ===');
            console.log('');

            let created = 0;
            let skipped = 0;

            for (const tmplDef of SYSTEM_TEMPLATES) {
                // Check if already seeded (by name + is_system)
                const existing = await this.templateRepository.findOne({
                    name: tmplDef.name,
                    is_system: true,
                    soft_delete: false,
                });

                if (existing) {
                    // Upsert sections — update body/title so re-seeding picks up changes
                    const existingSections = await this.sectionRepository.findAll({
                        contract_template_id: existing._id,
                        soft_delete: false,
                    }) as any[];
                    for (const secDef of tmplDef.sections) {
                        const existingSec = existingSections.find((s: any) => s.order === secDef.order);
                        if (existingSec) {
                            await this.sectionRepository.update(existingSec, {
                                title: secDef.title,
                                rich_text_body: secDef.rich_text_body.trim(),
                            });
                        } else {
                            await this.sectionRepository.create({
                                contract_template_id: existing._id,
                                title: secDef.title,
                                description: secDef.description || null,
                                rich_text_body: secDef.rich_text_body.trim(),
                                order: secDef.order,
                                is_active: true,
                                soft_delete: false,
                            });
                        }
                    }
                    console.log(`  ~ Updated sections for "${tmplDef.name}"`);
                    skipped++;
                    continue;
                }

                // Create template
                const template = await this.templateRepository.create({
                    company_id: null as any,
                    name: tmplDef.name,
                    description: tmplDef.description,
                    status: 'active',
                    version: 1,
                    is_default: false,
                    is_system: true,
                    requires_signature: tmplDef.requires_signature,
                    created_by: null as any,
                    soft_delete: false,
                });

                console.log(`  + Created template: "${tmplDef.name}" (${template._id})`);

                // Create sections
                for (const secDef of tmplDef.sections) {
                    await this.sectionRepository.create({
                        contract_template_id: template._id,
                        title: secDef.title,
                        description: secDef.description || null,
                        rich_text_body: secDef.rich_text_body.trim(),
                        order: secDef.order,
                        is_active: true,
                        soft_delete: false,
                    });
                }

                console.log(`    - Seeded ${tmplDef.sections.length} sections`);
                created++;
            }

            console.log('');
            console.log('=== Seed Summary ===');
            console.log(`  Created : ${created} template(s)`);
            console.log(`  Skipped : ${skipped} template(s)`);
            console.log('');
            console.log('Contract templates seeding completed successfully!');
        } catch (error) {
            console.error('Error during contract templates seeding:', error);
            throw error;
        }
    }

    @Command({
        command: 'remove:contract-templates',
        describe: 'Remove system-level contract templates',
    })
    async remove(): Promise<void> {
        try {
            console.log('=== Removing System Contract Templates ===');
            const items = await this.templateRepository.findAll({
                is_system: true,
                soft_delete: false,
            }) as any[];

            for (const tmpl of items) {
                // Soft-delete sections
                const sections = await this.sectionRepository.findAll({
                    contract_template_id: tmpl._id,
                }) as any[];
                for (const sec of sections) {
                    await this.sectionRepository.update(sec, { soft_delete: true });
                }
                // Soft-delete template
                await this.templateRepository.update(tmpl, { soft_delete: true });
                console.log(`  - Removed "${tmpl.name}"`);
            }

            console.log('Contract templates removal completed.');
        } catch (error) {
            console.error('Error during contract templates removal:', error);
            throw error;
        }
    }
}
