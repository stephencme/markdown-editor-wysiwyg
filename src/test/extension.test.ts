import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Test Suite", () => {
  const EXTENSION_ID = "stephencme.markdown-editor-wysiwyg";
  const OPEN_BUILT_IN = "stephencme.markdownEditor.openWithBuiltInTextEditor";
  const OPEN_MARKDOWN = "stephencme.markdownEditor.openWithMarkdownEditor";

  test("extension is discoverable in host", () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, "expected extension to be available");
  });

  test("commands are registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes(OPEN_BUILT_IN),
      "openWithBuiltInTextEditor should be registered",
    );
    assert.ok(
      commands.includes(OPEN_MARKDOWN),
      "openWithMarkdownEditor should be registered",
    );
  });
});
