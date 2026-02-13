import { useState, useCallback } from "react";

export type ConnectionStatus = "connected" | "disconnected" | "error";

export interface WebhookConnection {
  id: string;
  sourceName: string;
  workflowName: string;
  webhookUrl: string;
  status: ConnectionStatus;
  createdAt: string;
}

const initialConnections: WebhookConnection[] = [
  {
    id: "conn-1",
    sourceName: "KPI Dashboard",
    workflowName: "Daily Report Workflow",
    webhookUrl: "https://api.pucho.ai/webhook/daily-report",
    status: "connected",
    createdAt: "2026-02-10T09:00:00Z",
  },
  {
    id: "conn-2",
    sourceName: "Execution Logs",
    workflowName: "Error Alert Workflow",
    webhookUrl: "https://api.pucho.ai/webhook/error-alert",
    status: "connected",
    createdAt: "2026-02-11T14:30:00Z",
  },
  {
    id: "conn-3",
    sourceName: "Chart Data",
    workflowName: "Analytics Pipeline",
    webhookUrl: "https://api.pucho.ai/webhook/analytics",
    status: "connected",
    createdAt: "2026-02-12T11:15:00Z",
  },
];

let nextId = 4;

export function useWebhookManager() {
  const [connections, setConnections] =
    useState<WebhookConnection[]>(initialConnections);

  const addConnection = useCallback(
    (sourceName: string, workflowName: string, webhookUrl: string) => {
      const newConnection: WebhookConnection = {
        id: `conn-${nextId++}`,
        sourceName,
        workflowName,
        webhookUrl,
        status: "connected",
        createdAt: new Date().toISOString(),
      };
      setConnections((prev) => [...prev, newConnection]);
    },
    []
  );

  const removeConnection = useCallback((id: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const triggerWebhook = useCallback(
    async (id: string, payload: unknown): Promise<boolean> => {
      const connection = connections.find((c) => c.id === id);
      if (!connection) return false;
      console.log(
        `[Pucho Webhook] Triggering ${connection.workflowName} at ${connection.webhookUrl}`,
        payload
      );
      return true;
    },
    [connections]
  );

  return { connections, addConnection, removeConnection, triggerWebhook };
}
