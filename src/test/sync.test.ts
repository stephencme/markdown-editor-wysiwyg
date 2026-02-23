import * as assert from "assert";
import * as vscode from "vscode";

import {
  canonicalizeMarkdownForSync,
  consumeExpectedApplyCanonical,
  enqueueExpectedApplyCanonical,
  shouldAcceptSequence,
  shouldPostExternalSetContent,
} from "../documentSync.js";
import {
  isHostToWebviewMessage,
  isNewerSequence,
  isWebviewToHostMessage,
  UPDATE_SOURCE,
} from "../messageProtocol.js";
import { hasExplicitScheme, isAllowedLinkHref } from "../linkValidation.js";
import { resolveImageSrcs, restoreImageSrcs } from "../images.js";
import { getRestorableSelection } from "../webview/selectionRestore.js";

suite("selection restore", () => {
  test("restores selection when in bounds", () => {
    const selection = getRestorableSelection({ from: 2, to: 5 }, 10);
    assert.deepStrictEqual(selection, { from: 2, to: 5 });
  });

  test("does not clamp out-of-bounds selection to end", () => {
    const selection = getRestorableSelection({ from: 12, to: 12 }, 10);
    assert.strictEqual(selection, null);
  });

  test("rejects invalid selection shape", () => {
    const selection = getRestorableSelection({ from: 5, to: 3 }, 10);
    assert.strictEqual(selection, null);
  });
});

suite("sync sequence guards", () => {
  test("accepts only newer sequences", () => {
    assert.strictEqual(isNewerSequence(2, 1), true);
    assert.strictEqual(isNewerSequence(1, 1), false);
    assert.strictEqual(isNewerSequence(0, 1), false);
    assert.strictEqual(shouldAcceptSequence(3, 2), true);
    assert.strictEqual(shouldAcceptSequence(2, 2), false);
  });

  test("rejects invalid or unsafe sequence values", () => {
    assert.strictEqual(isNewerSequence(-1, 0), false);
    assert.strictEqual(isNewerSequence(1.1, 1), false);
    assert.strictEqual(isNewerSequence(Number.MAX_SAFE_INTEGER + 1, 1), false);
    assert.strictEqual(isNewerSequence(1, -1), false);
  });
});

suite("sync equivalence gate", () => {
  test("canonicalization normalizes line endings and trailing newline noise", () => {
    const a = canonicalizeMarkdownForSync("A\r\nB\r\n");
    const b = canonicalizeMarkdownForSync("A\nB\n\n");
    assert.strictEqual(a, "A\nB");
    assert.strictEqual(b, "A\nB");
  });

  test("posts external set content only when canonical markdown differs or baseline is missing", () => {
    const cases: Array<{
      document: string;
      lastWebview: string | null;
      expected: boolean;
    }> = [
      { document: "A\nB", lastWebview: "A\nB", expected: false },
      { document: "A\nB", lastWebview: "A\nC", expected: true },
      { document: "A\nB", lastWebview: null, expected: true },
    ];
    for (const testCase of cases) {
      assert.strictEqual(
        shouldPostExternalSetContent(testCase.document, testCase.lastWebview),
        testCase.expected,
      );
    }
  });

  test("enqueue keeps latest canonicals when over max size", () => {
    const queue = enqueueExpectedApplyCanonical(["A", "B"], "C", 2);
    assert.deepStrictEqual(queue, ["B", "C"]);
  });

  test("enqueue rejects invalid max size", () => {
    assert.throws(() => enqueueExpectedApplyCanonical([], "A", 0));
  });

  test("consume removes matching canonical once", () => {
    const { matched, canonicals } = consumeExpectedApplyCanonical(
      ["A", "B", "A"],
      "A",
    );
    assert.strictEqual(matched, true);
    assert.deepStrictEqual(canonicals, ["B", "A"]);
  });

  test("consume is no-op when canonical not present", () => {
    const { matched, canonicals } = consumeExpectedApplyCanonical(
      ["A", "B"],
      "C",
    );
    assert.strictEqual(matched, false);
    assert.deepStrictEqual(canonicals, ["A", "B"]);
  });
});

suite("typed message protocol", () => {
  test("accepts typed webview update with source + sequence", () => {
    const message: unknown = {
      type: "UPDATE",
      html: "<p>hi</p>",
      sequence: 7,
      source: UPDATE_SOURCE.WEBVIEW_EDIT,
    };
    assert.strictEqual(isWebviewToHostMessage(message), true);
  });

  test("rejects malformed webview update", () => {
    const message: unknown = {
      type: "UPDATE",
      html: "<p>hi</p>",
      sequence: "7",
      source: UPDATE_SOURCE.WEBVIEW_EDIT,
    };
    assert.strictEqual(isWebviewToHostMessage(message), false);
  });

  test("accepts set content with source metadata", () => {
    const message: unknown = {
      type: "SET_CONTENT",
      html: "<p>doc</p>",
      sequence: 4,
      source: UPDATE_SOURCE.EXTERNAL_DOC_CHANGE,
    };
    assert.strictEqual(isHostToWebviewMessage(message), true);
  });
});

suite("link validation", () => {
  test("accepts allowed protocols and relative links", () => {
    assert.strictEqual(isAllowedLinkHref("https://example.com"), true);
    assert.strictEqual(isAllowedLinkHref("mailto:a@example.com"), true);
    assert.strictEqual(isAllowedLinkHref("./docs/readme.md"), true);
    assert.strictEqual(isAllowedLinkHref("#intro"), true);
  });

  test("rejects disallowed protocols", () => {
    assert.strictEqual(isAllowedLinkHref("javascript:alert(1)"), false);
    assert.strictEqual(isAllowedLinkHref("data:text/html;base64,AA=="), false);
  });

  test("detects explicit schemes correctly", () => {
    assert.strictEqual(hasExplicitScheme("https://example.com"), true);
    assert.strictEqual(hasExplicitScheme("mailto:test@example.com"), true);
    assert.strictEqual(hasExplicitScheme("./relative/path"), false);
    assert.strictEqual(hasExplicitScheme("#hash"), false);
  });
});

suite("image src transforms", () => {
  const documentUri = vscode.Uri.parse("file:///workspace/docs/note.md");
  const mockWebview = {
    asWebviewUri(uri: vscode.Uri): vscode.Uri {
      return vscode.Uri.parse(`vscode-webview://test${uri.path}`);
    },
  } as unknown as vscode.Webview;

  test("resolves and restores relative image src with single quotes", () => {
    const html = "<p><img alt='a' src='images/pic.png'></p>";
    const resolved = resolveImageSrcs(html, documentUri, mockWebview);
    assert.match(
      resolved,
      /vscode-webview:\/\/test\/workspace\/docs\/images\/pic\.png/,
    );
    const restored = restoreImageSrcs(resolved, documentUri, mockWebview);
    assert.match(restored, /src=\"images\/pic\.png\"/);
  });

  test("preserves query and fragment during resolve/restore", () => {
    const html = '<p><img src="images/pic.png?size=2#hero"></p>';
    const resolved = resolveImageSrcs(html, documentUri, mockWebview);
    assert.match(resolved, /\?size=2#hero/);
    const restored = restoreImageSrcs(resolved, documentUri, mockWebview);
    assert.match(restored, /src=\"images\/pic\.png\?size=2#hero\"/);
  });

  test("does not rewrite absolute http or data image src", () => {
    const httpHtml = '<p><img src="https://example.com/pic.png"></p>';
    const dataHtml = '<p><img src="data:image/png;base64,AAAA"></p>';
    const resolvedHttp = resolveImageSrcs(httpHtml, documentUri, mockWebview);
    const resolvedData = resolveImageSrcs(dataHtml, documentUri, mockWebview);
    assert.ok(
      resolvedHttp.includes('src="https://example.com/pic.png"'),
      "http src should remain unchanged",
    );
    assert.ok(
      !resolvedHttp.includes("vscode-webview://"),
      "http src should not be rewritten to webview URI",
    );
    assert.ok(
      resolvedData.includes('src="data:image/png;base64,AAAA"'),
      "data src should remain unchanged",
    );
    assert.ok(
      !resolvedData.includes("vscode-webview://"),
      "data src should not be rewritten to webview URI",
    );
  });

  test("restore leaves data URL image src unchanged", () => {
    const dataHtml =
      '<p><img src="data:image/png;base64,AAAA" alt="embedded"></p>';
    const restored = restoreImageSrcs(dataHtml, documentUri, mockWebview);
    assert.ok(
      restored.includes('src="data:image/png;base64,AAAA"'),
      "data src should remain unchanged in restore",
    );
    assert.ok(
      !restored.includes("vscode-webview://"),
      "restore should not rewrite data src to webview URI",
    );
  });

  test("round-trip resolve and restore preserves data URL exactly", () => {
    const dataSrc = "data:image/svg+xml;charset=utf-8,%3Csvg%20/%3E";
    const html = `<p><img src="${dataSrc}" alt="vector"></p>`;
    const resolved = resolveImageSrcs(html, documentUri, mockWebview);
    const restored = restoreImageSrcs(resolved, documentUri, mockWebview);
    assert.ok(
      restored.includes(`src="${dataSrc}"`),
      "data src should be preserved through resolve and restore",
    );
  });
});
