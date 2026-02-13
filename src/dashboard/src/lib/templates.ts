import {
  createAction,
  createWorkflow,
  chainActions,
  type PuchoWorkflow,
} from "./workflow";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  generate: () => PuchoWorkflow;
}

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "webhook-to-sheets",
    name: "Webhook to Google Sheets",
    description:
      "Receive webhook data and automatically append it as a new row in Google Sheets.",
    icon: "\uD83D\uDCCA",
    generate: () => {
      const appendRow = createAction("google-sheets", "append_row", {
        spreadsheetId: "{{spreadsheet_id}}",
        sheetName: "Sheet1",
        values: "{{trigger.body}}",
      });
      return createWorkflow("webhook-to-google-sheets", appendRow);
    },
  },
  {
    id: "scheduled-email-report",
    name: "Scheduled Email Report",
    description:
      "Process data with custom code, then send a formatted email report via Gmail.",
    icon: "\uD83D\uDCE7",
    generate: () => {
      const runCode = createAction("code", "run_code", {
        code: "// Transform data into report format\nreturn { subject: 'Daily Report', body: JSON.stringify(input) };",
      });
      const sendEmail = createAction("gmail", "send_email", {
        to: "{{recipient}}",
        subject: "{{previous.subject}}",
        body: "{{previous.body}}",
      });
      const firstAction = chainActions(runCode, sendEmail);
      return createWorkflow("scheduled-email-report", firstAction);
    },
  },
  {
    id: "slack-notification",
    name: "Slack Notification on Webhook",
    description:
      "Send a Slack message to a channel whenever a webhook event is received.",
    icon: "\uD83D\uDD14",
    generate: () => {
      const sendMessage = createAction("slack", "send_message", {
        channel: "{{channel_id}}",
        text: "New webhook event received: {{trigger.body.event}}",
      });
      return createWorkflow("slack-notification-on-webhook", sendMessage);
    },
  },
];
