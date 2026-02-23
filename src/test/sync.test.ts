import * as assert from "assert";

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
