export enum ENUM_WIDGET_STATUS {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

export enum ENUM_WIDGET_TOOL_SLUG {
    WAZUH = 'wazuh',
    HELPDESK = 'helpdesk-support-ticket',
    THREAT_INTEL = 'netswitch-threat-intel',
    OPENVAS = 'openvas',
}

export enum ENUM_WIDGET_SLUG {
    // SIEM/Wazuh widgets
    SIEM_INCIDENT_TRENDING = 'siem-incident-trending',
    CONFIGURATION_ASSESSMENT = 'configuration-assessment',
    CRITICAL_INCIDENT_BY_TYPE = 'critical-incident-by-type',
    AGENT_SUMMARY = 'agent-summary',
    
    // Helpdesk widgets
    REQUEST_CLOSED_21_DAYS = 'request-closed-21-days',
    REQUEST_RECEIVED_21_DAYS = 'request-received-21-days',
    UNASSIGNED_OPEN_REQUEST = 'unassigned-open-request',
    SLA_VIOLATED_REQUEST = 'sla-violated-request',
    REQUEST_SUMMARY = 'request-summary',
    
    // Threat Intel widgets
    THREAT_INTEL = 'threat-intel',
    
    // OpenVAS widgets
    VULNERABILITIES_TRENDING = 'vulnerabilities-trending',
}