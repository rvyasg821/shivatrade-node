import { IToolWidgetConfig } from '../interfaces/widget.interface';
import { ENUM_WIDGET_TOOL_SLUG, ENUM_WIDGET_SLUG } from '../enums/widget.enum';

export const WIDGET_DEFAULT_CONFIGURATIONS: IToolWidgetConfig = {
    [ENUM_WIDGET_TOOL_SLUG.WAZUH]: {
        widgets: [
            {
                slug: ENUM_WIDGET_SLUG.SIEM_INCIDENT_TRENDING,
                name: 'SIEM Incident Trending',
                order: 1,
                is_visible: true,
            },
            {
                slug: ENUM_WIDGET_SLUG.CONFIGURATION_ASSESSMENT,
                name: 'Configuration Assessment',
                order: 2,
                is_visible: true,
            },
            {
                slug: ENUM_WIDGET_SLUG.CRITICAL_INCIDENT_BY_TYPE,
                name: 'Critical Incident by Type',
                order: 3,
                is_visible: true,
            },
            {
                slug: ENUM_WIDGET_SLUG.AGENT_SUMMARY,
                name: 'Agent Summary',
                order: 4,
                is_visible: true,
            },
        ],
    },
    [ENUM_WIDGET_TOOL_SLUG.HELPDESK]: {
        widgets: [
            {
                slug: ENUM_WIDGET_SLUG.REQUEST_CLOSED_21_DAYS,
                name: 'Request Closed in Last 21 Days',
                order: 5,
                is_visible: true,
            },
            {
                slug: ENUM_WIDGET_SLUG.REQUEST_RECEIVED_21_DAYS,
                name: 'Request Received in Last 21 Days',
                order: 6,
                is_visible: true,
            },
            {
                slug: ENUM_WIDGET_SLUG.UNASSIGNED_OPEN_REQUEST,
                name: 'Unassigned and Open Request',
                order: 7,
                is_visible: true,
            },
            {
                slug: ENUM_WIDGET_SLUG.SLA_VIOLATED_REQUEST,
                name: 'SLA Violated Request',
                order: 8,
                is_visible: true,
            },
            {
                slug: ENUM_WIDGET_SLUG.REQUEST_SUMMARY,
                name: 'Request Summary',
                order: 9,
                is_visible: true,
            },
        ],
    },
    [ENUM_WIDGET_TOOL_SLUG.THREAT_INTEL]: {
        widgets: [
            {
                slug: ENUM_WIDGET_SLUG.THREAT_INTEL,
                name: 'Threat Intel',
                order: 10,
                is_visible: true,
            },
        ],
    },
    [ENUM_WIDGET_TOOL_SLUG.OPENVAS]: {
        widgets: [
            {
                slug: ENUM_WIDGET_SLUG.VULNERABILITIES_TRENDING,
                name: 'Vulnerabilities Trending',
                order: 11,
                is_visible: true,
            },
        ],
    },
};