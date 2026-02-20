import * as vscode from "vscode";

import {
  EDITOR_NAMESPACE,
  EDITOR_VIEW_ID,
  MarkdownEditorProvider,
} from "./markdownEditorProvider.js";

const MD_PATTERN = "*.md";
// Diff/source-control views should use the built-in text editor
const MD_DIFF_PATTERN = "{git,merge,gitlens,pr}:/**/*.md";

function setDefaultEditorAssociation(): void {
  const config = vscode.workspace.getConfiguration();
  const associations =
    config.get<Record<string, string>>("workbench.editorAssociations") ?? {};
  // User explicitly chose a different editor for MD_PATTERN — respect choice
  if (associations[MD_PATTERN] && associations[MD_PATTERN] !== EDITOR_VIEW_ID)
    return;
  config.update(
    "workbench.editorAssociations",
    // MD_DIFF_PATTERN comes first, spread preserves any existing user value for it
    // MD_PATTERN is written last to guarantee it is set
    {
      [MD_DIFF_PATTERN]: "default",
      ...associations,
      [MD_PATTERN]: EDITOR_VIEW_ID,
    },
    vscode.ConfigurationTarget.Global,
  );
}

export function activate(context: vscode.ExtensionContext) {
  console.log(`[${EDITOR_NAMESPACE}:activate] extension active`);
  setDefaultEditorAssociation();
  context.subscriptions.push(MarkdownEditorProvider.register(context));
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EDITOR_NAMESPACE}.viewSource`, () => {
      const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      const uri =
        input instanceof vscode.TabInputCustom
          ? input.uri
          : vscode.window.activeTextEditor?.document.uri;
      if (uri) {
        vscode.commands.executeCommand("vscode.openWith", uri, "default");
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      `${EDITOR_NAMESPACE}.openInMarkdownEditor`,
      () => {
        const uri = vscode.window.activeTextEditor?.document.uri;
        if (uri) {
          vscode.commands.executeCommand(
            "vscode.openWith",
            uri,
            EDITOR_VIEW_ID,
          );
        }
      },
    ),
  );
}

export function deactivate() {}
