// ── Pucho AI Studio Workflow JSON Generator (schemaVersion 7) ──

export type PuchoToolName =
  | "webhook"
  | "http"
  | "code"
  | "schedule"
  | "google-sheets"
  | "gmail"
  | "slack";

export interface PuchoAction {
  name: string;
  type: "PIECE";
  settings: {
    pieceName: string;
    pieceVersion: string;
    actionName: string;
    input: Record<string, unknown>;
  };
  nextAction: PuchoAction | null;
}

export interface PuchoTrigger {
  type: "PIECE_TRIGGER";
  settings: {
    pieceName: string;
    pieceVersion: string;
    triggerName: string;
  };
  nextAction: PuchoAction | null;
}

export interface PuchoWorkflow {
  name: string;
  template: {
    trigger: PuchoTrigger;
    schemaVersion: "7";
  };
}

function toolPieceName(toolName: PuchoToolName): string {
  return `@puchoaistudio/tool-${toolName}`;
}

export function createAction(
  toolName: PuchoToolName,
  actionName: string,
  input: Record<string, unknown> = {}
): PuchoAction {
  return {
    name: `${toolName}-${actionName}`,
    type: "PIECE",
    settings: {
      pieceName: toolPieceName(toolName),
      pieceVersion: "~0.4.8",
      actionName,
      input,
    },
    nextAction: null,
  };
}

export function chainActions(...actions: PuchoAction[]): PuchoAction {
  for (let i = 0; i < actions.length - 1; i++) {
    actions[i].nextAction = actions[i + 1];
  }
  actions[actions.length - 1].nextAction = null;
  return actions[0];
}

export function createWebhookTrigger(
  firstAction: PuchoAction | null
): PuchoTrigger {
  return {
    type: "PIECE_TRIGGER",
    settings: {
      pieceName: toolPieceName("webhook"),
      pieceVersion: "~0.4.8",
      triggerName: "catch_webhook",
    },
    nextAction: firstAction,
  };
}

export function createWorkflow(
  name: string,
  firstAction: PuchoAction | null
): PuchoWorkflow {
  return {
    name,
    template: {
      trigger: createWebhookTrigger(firstAction),
      schemaVersion: "7",
    },
  };
}
