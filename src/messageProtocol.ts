export const UPDATE_SOURCE = {
  WEBVIEW_EDIT: "WEBVIEW_EDIT",
  EXTERNAL_DOC_CHANGE: "EXTERNAL_DOC_CHANGE",
  SAVE_FLUSH: "SAVE_FLUSH",
  INITIAL_LOAD: "INITIAL_LOAD",
} as const;

export type UpdateSource = (typeof UPDATE_SOURCE)[keyof typeof UPDATE_SOURCE];

export type WebviewToHostMessage =
  | { type: "READY" }
  | {
      type: "UPDATE";
      html: string;
      sequence: number;
      source: typeof UPDATE_SOURCE.WEBVIEW_EDIT;
    }
  | { type: "OPEN_LINK"; href: string }
  | {
      type: "REQUEST_LINK";
      selectedText: string;
      currentHref: string;
      hasSelection: boolean;
    };

export type HostToWebviewMessage =
  | {
      type: "SET_CONTENT";
      html: string;
      sequence: number;
      source: UpdateSource;
    }
  | { type: "APPLY_LINK"; href: string; text?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isUpdateSource(value: unknown): value is UpdateSource {
  return (
    value === UPDATE_SOURCE.WEBVIEW_EDIT ||
    value === UPDATE_SOURCE.EXTERNAL_DOC_CHANGE ||
    value === UPDATE_SOURCE.SAVE_FLUSH ||
    value === UPDATE_SOURCE.INITIAL_LOAD
  );
}

export function isWebviewToHostMessage(
  message: unknown,
): message is WebviewToHostMessage {
  if (!isRecord(message) || typeof message.type !== "string") return false;

  switch (message.type) {
    case "READY":
      return true;
    case "UPDATE":
      return (
        typeof message.html === "string" &&
        isSafeInteger(message.sequence) &&
        message.sequence > 0 &&
        message.source === UPDATE_SOURCE.WEBVIEW_EDIT
      );
    case "OPEN_LINK":
      return typeof message.href === "string";
    case "REQUEST_LINK":
      return (
        typeof message.selectedText === "string" &&
        typeof message.currentHref === "string" &&
        typeof message.hasSelection === "boolean"
      );
    default:
      return false;
  }
}

export function isHostToWebviewMessage(
  message: unknown,
): message is HostToWebviewMessage {
  if (!isRecord(message) || typeof message.type !== "string") return false;

  switch (message.type) {
    case "SET_CONTENT":
      return (
        typeof message.html === "string" &&
        isSafeInteger(message.sequence) &&
        message.sequence > 0 &&
        isUpdateSource(message.source)
      );
    case "APPLY_LINK":
      return (
        typeof message.href === "string" &&
        (message.text === undefined || typeof message.text === "string")
      );
    default:
      return false;
  }
}

export function isNewerSequence(
  sequence: number,
  lastSequence: number,
): boolean {
  return (
    Number.isSafeInteger(sequence) &&
    Number.isSafeInteger(lastSequence) &&
    sequence > 0 &&
    lastSequence >= 0 &&
    sequence > lastSequence
  );
}
