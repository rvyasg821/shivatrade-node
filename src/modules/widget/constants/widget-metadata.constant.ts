// import { IWidgetMetadata } from '../interfaces/widget.interface';
// import { ENUM_WIDGET_SLUG } from '../enums/widget.enum';

// export const WIDGET_METADATA: IWidgetMetadata[] = [
//     {
//         slug: ENUM_WIDGET_SLUG.SIEM_INCIDENT_TRENDING,
//         name: 'SIEM Incident Trending',
//     },
//     {
//         slug: ENUM_WIDGET_SLUG.CONFIGURATION_ASSESSMENT,
//         name: 'Configuration Assessment',
//     },
//     {
//         slug: ENUM_WIDGET_SLUG.CRITICAL_INCIDENT_BY_TYPE,
//         name: 'Critical Incident by Type',
//     },
//     {
//         slug: ENUM_WIDGET_SLUG.AGENT_SUMMARY,
//         name: 'Agent Summary',
//     },
//     {
//         slug: ENUM_WIDGET_SLUG.REQUEST_CLOSED_21_DAYS,
//         name: 'Request Closed in Last 21 Days',
//     },
//     {
//         slug: ENUM_WIDGET_SLUG.REQUEST_RECEIVED_21_DAYS,
//         name: 'Request Received in Last 21 Days',
//     },
//     {
//         slug: ENUM_WIDGET_SLUG.UNASSIGNED_OPEN_REQUEST,
//         name: 'Unassigned and Open Request',
//     },
//     {
//         slug: ENUM_WIDGET_SLUG.SLA_VIOLATED_REQUEST,
//         name: 'SLA Violated Request',
//     },
//     {
//         slug: ENUM_WIDGET_SLUG.REQUEST_SUMMARY,
//         name: 'Request Summary',
//     },
//     {
//         slug: ENUM_WIDGET_SLUG.THREAT_INTEL,
//         name: 'Threat Intel',
//     },
//     {
//         slug: ENUM_WIDGET_SLUG.VULNERABILITIES_TRENDING,
//         name: 'Vulnerabilities Trending',
//     },
// ];

// // Helper function to get widget metadata by slug
// export const getWidgetMetadataBySlug = (slug: string): IWidgetMetadata | undefined => {
//     return WIDGET_METADATA.find(metadata => metadata.slug === slug);
// };

// // Helper function to get all widget metadata as a map for quick lookups
// export const getWidgetMetadataMap = (): Map<string, string> => {
//     const metadataMap = new Map<string, string>();
//     WIDGET_METADATA.forEach(metadata => {
//         metadataMap.set(metadata.slug, metadata.name);
//     });
//     return metadataMap;
// };