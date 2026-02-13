// ── KPI Data ──────────────────────────────────────────────
export interface KPIItem {
  label: string;
  value: string;
  trend: "up" | "down";
}

export const kpiData: KPIItem[] = [
  { label: "Total Workflows", value: "42", trend: "up" },
  { label: "Active Users", value: "1,284", trend: "up" },
  { label: "Success Rate", value: "98.7%", trend: "up" },
  { label: "Avg Response", value: "1.2s", trend: "down" },
];

// ── Chart Data ────────────────────────────────────────────
export interface ExecutionDataPoint {
  day: string;
  executions: number;
}

export const executionTrendData: ExecutionDataPoint[] = [
  { day: "Mon", executions: 120 },
  { day: "Tue", executions: 180 },
  { day: "Wed", executions: 150 },
  { day: "Thu", executions: 210 },
  { day: "Fri", executions: 190 },
  { day: "Sat", executions: 95 },
  { day: "Sun", executions: 130 },
];

export interface DistributionSegment {
  name: string;
  value: number;
  color: string;
}

export const workflowDistributionData: DistributionSegment[] = [
  { name: "API Workflows", value: 35, color: "#5922c6" },
  { name: "Email Workflows", value: 25, color: "#af3db8" },
  { name: "Scheduled Tasks", value: 22, color: "#93d6ff" },
  { name: "Data Pipelines", value: 18, color: "#91ffd0" },
];

// ── Execution Log Data ────────────────────────────────────
export type ExecutionStatus = "success" | "failed" | "running";

export interface ExecutionLogEntry {
  id: string;
  workflowName: string;
  status: ExecutionStatus;
  duration: string;
  timestamp: string;
}

export const executionLogData: ExecutionLogEntry[] = [
  { id: "1", workflowName: "User Onboarding Flow", status: "success", duration: "1.2s", timestamp: "2026-02-13 14:32:01" },
  { id: "2", workflowName: "Daily Report Generator", status: "success", duration: "3.8s", timestamp: "2026-02-13 14:28:15" },
  { id: "3", workflowName: "Slack Alert Pipeline", status: "failed", duration: "0.5s", timestamp: "2026-02-13 14:25:42" },
  { id: "4", workflowName: "Data Sync Workflow", status: "running", duration: "—", timestamp: "2026-02-13 14:22:10" },
  { id: "5", workflowName: "Email Campaign Trigger", status: "success", duration: "2.1s", timestamp: "2026-02-13 14:18:33" },
  { id: "6", workflowName: "Webhook Relay", status: "success", duration: "0.8s", timestamp: "2026-02-13 14:15:07" },
  { id: "7", workflowName: "Sheet Update Pipeline", status: "failed", duration: "1.1s", timestamp: "2026-02-13 14:10:29" },
  { id: "8", workflowName: "Scheduled Cleanup", status: "success", duration: "5.4s", timestamp: "2026-02-13 14:05:51" },
  { id: "9", workflowName: "API Gateway Monitor", status: "success", duration: "0.3s", timestamp: "2026-02-13 14:00:12" },
  { id: "10", workflowName: "Notification Dispatcher", status: "running", duration: "—", timestamp: "2026-02-13 13:55:44" },
  { id: "11", workflowName: "Lead Scoring Engine", status: "success", duration: "2.7s", timestamp: "2026-02-13 13:50:08" },
  { id: "12", workflowName: "Invoice Generator", status: "success", duration: "4.2s", timestamp: "2026-02-13 13:45:30" },
];
