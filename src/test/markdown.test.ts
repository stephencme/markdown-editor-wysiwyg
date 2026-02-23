import * as assert from "assert";
import {
  extractHtmlComments,
  htmlToMarkdown,
  markdownToHtml,
  restoreHtmlComments,
} from "../markdown.js";
import { inlineRoundTripCases } from "./fixtures/inlineRoundTripCases.js";

async function roundTrip(md: string): Promise<string> {
  const html = await markdownToHtml(md);
  return (await htmlToMarkdown(html)).trim();
}

function assertRoundTripInvariants(result: string, caseName: string): void {
  // Round-trip markdown is normalized by design, so we assert behavioral
  // invariants rather than strict string identity.
  assert.ok(
    !/&#x[0-9a-f]+;/i.test(result),
    `${caseName}: should not emit numeric hex entities`,
  );
  assert.ok(
    !result.includes("\\***\\*"),
    `${caseName}: should not emit escaped emphasis storm pattern`,
  );
}

function buildGeneratedInlineCases(): Array<{
  name: string;
  input: string;
  mustContain: string[];
}> {
  const wrappers = [
    { name: "underscore", open: "_", close: "_" },
    { name: "asterisk", open: "*", close: "*" },
    { name: "strikethrough", open: "~~", close: "~~" },
  ];
  const spaces = [
    { name: "ascii-space", value: " " },
    { name: "nbsp", value: "\u00A0" },
    { name: "tab", value: "\t" },
  ];
  const out: Array<{ name: string; input: string; mustContain: string[] }> = [];

  for (const wrapper of wrappers) {
    for (const space of spaces) {
      out.push({
        name: `${wrapper.name}-${space.name}`,
        input:
          `${wrapper.open}alpha${space.value}` +
          `[doc](https://example.com/docs)` +
          `${space.value}**Bold Label**.${wrapper.close}`,
        mustContain: ["[doc](https://example.com/docs)", "**Bold Label**"],
      });
    }
  }

  return out;
}

suite("markdownToHtml", () => {
  test("headings", async () => {
    const html = await markdownToHtml("# Hello");
    assert.strictEqual(html, "<h1>Hello</h1>");
  });

  test("bold and italic", async () => {
    const html = await markdownToHtml("**bold** and *italic*");
    assert.strictEqual(
      html,
      "<p><strong>bold</strong> and <em>italic</em></p>",
    );
  });

  test("strikethrough", async () => {
    const html = await markdownToHtml("~~deleted~~");
    assert.strictEqual(html, "<p><del>deleted</del></p>");
  });

  test("inline code", async () => {
    const html = await markdownToHtml("use `fmt.Println`");
    assert.strictEqual(html, "<p>use <code>fmt.Println</code></p>");
  });

  test("fenced code block", async () => {
    const html = await markdownToHtml("```js\nalert(1)\n```");
    assert.strictEqual(
      html,
      '<pre><code class="language-js">alert(1)\n</code></pre>',
    );
  });

  test("blockquote", async () => {
    const html = await markdownToHtml("> quote");
    assert.strictEqual(html, "<blockquote>\n<p>quote</p>\n</blockquote>");
  });

  test("bullet list", async () => {
    const html = await markdownToHtml("- a\n- b");
    assert.strictEqual(html, "<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
  });

  test("ordered list", async () => {
    const html = await markdownToHtml("1. a\n2. b");
    assert.strictEqual(html, "<ol>\n<li>a</li>\n<li>b</li>\n</ol>");
  });

  test("task list", async () => {
    const html = await markdownToHtml("- [ ] todo\n- [x] done");
    assert.match(html, /data-type="taskList"/);
    assert.match(html, /data-type="taskItem"/);
    assert.match(html, /data-checked="true"/);
    assert.match(html, /todo/);
    assert.match(html, /done/);
  });

  test("empty task item renders as checkbox taskItem", async () => {
    const html = await markdownToHtml("- [ ]");
    assert.match(html, /data-type="taskList"/);
    assert.match(html, /data-type="taskItem"/);
    assert.match(html, /data-checked="false"/);
    assert.doesNotMatch(html, /\[ ]/);
  });

  test("nested task list", async () => {
    const html = await markdownToHtml(
      "- [ ] one\n  - [x] two\n  - [ ] more\n- [ ] three",
    );
    assert.match(html, /data-type="taskList"/);
    // Nested list should also be a taskList, not a plain ul
    const taskListCount = (html.match(/data-type="taskList"/g) ?? []).length;
    assert.strictEqual(
      taskListCount,
      2,
      "should have outer and nested taskList",
    );
    assert.match(html, /data-checked="true"/);
  });

  test("nested empty task items stay as task lists", async () => {
    const html = await markdownToHtml("- [ ]\n  - [ ]\n- [ ]");
    const taskListCount = (html.match(/data-type="taskList"/g) ?? []).length;
    const taskItemCount = (html.match(/data-type="taskItem"/g) ?? []).length;
    assert.strictEqual(
      taskListCount,
      2,
      "should have outer and nested taskList for empty task items",
    );
    assert.strictEqual(taskItemCount, 3, "should render all empty task items");
    assert.doesNotMatch(html, /\[ ]/);
  });

  test("nested marker-only empty task item in mixed list renders as taskItem", async () => {
    const html = await markdownToHtml(
      "- [ ] one\n  - [x] 1\n  - [ ]\n- [ ] two\n- [x] three",
    );
    assert.doesNotMatch(html, /<li>\[ \]<\/li>/);
    assert.match(html, /data-type="taskItem"/);
    assert.match(html, /data-checked="false"/);
    assert.match(html, /data-checked="true"/);
  });

  test("link", async () => {
    const html = await markdownToHtml("[text](https://example.com)");
    assert.strictEqual(html, '<p><a href="https://example.com">text</a></p>');
  });

  test("autolink", async () => {
    const html = await markdownToHtml("https://example.com");
    assert.strictEqual(
      html,
      '<p><a href="https://example.com">https://example.com</a></p>',
    );
  });

  test("image", async () => {
    const html = await markdownToHtml("![alt](img.png)");
    assert.strictEqual(html, '<p><img src="img.png" alt="alt"></p>');
  });

  test("image data URL", async () => {
    const html = await markdownToHtml("![alt](data:image/png;base64,AAAA)");
    assert.strictEqual(
      html,
      '<p><img src="data:image/png;base64,AAAA" alt="alt"></p>',
    );
  });

  test("table", async () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const html = await markdownToHtml(md);
    assert.match(html, /<table>/);
    assert.match(html, /<th>A<\/th>/);
    assert.match(html, /<td>1<\/td>/);
  });

  test("horizontal rule", async () => {
    const html = await markdownToHtml("---");
    assert.strictEqual(html, "<hr>");
  });
});

suite("htmlToMarkdown", () => {
  test("headings", async () => {
    const md = await htmlToMarkdown("<h2>Title</h2>");
    assert.strictEqual(md.trim(), "## Title");
  });

  test("bold and italic", async () => {
    const md = await htmlToMarkdown(
      "<p><strong>bold</strong> and <em>italic</em></p>",
    );
    assert.strictEqual(md.trim(), "**bold** and *italic*");
  });

  test("adjacent fragmented emphasis nodes normalize cleanly", async () => {
    const html =
      "<p>" +
      "<em>Note that in Cursor 2.1+, editor action icons are </em>" +
      '<em><a href="https://forum.cursor.com/t/editor-actions-icons-disappeared-in-2-1-0-version/143207">hidden by default</a></em>' +
      "<em>. To show them, click on the three dots in the editor tab bar menu and select </em>" +
      "<em><strong>Configure Icon Visibility</strong></em>" +
      "<em>&nbsp;for each command.</em>" +
      "</p>";
    const md = await htmlToMarkdown(html);
    assert.ok(
      !md.includes("&#x20;"),
      "should not include space entity escapes",
    );
    assert.ok(!md.includes("&#xA0;"), "should not include nbsp entity escapes");
    assert.ok(
      !md.includes("\\***\\*"),
      "should not include escaped emphasis storms",
    );
    assert.ok(
      md.includes(
        "[hidden by default](https://forum.cursor.com/t/editor-actions-icons-disappeared-in-2-1-0-version/143207)",
      ),
      "should keep link markdown",
    );
    assert.ok(
      md.includes("**Configure Icon Visibility**"),
      "should keep nested strong markdown",
    );
  });

  test("space entities normalize to literal spaces", async () => {
    const html =
      "<p>" +
      "<em>Note that in Cursor 2.1+, editor action icons are </em>" +
      '<a href="https://forum.cursor.com/t/editor-actions-icons-disappeared-in-2-1-0-version/143207"><em>hidden by default</em></a>' +
      "<em>. To show them, click on the three dots in the editor tab bar menu and select </em>" +
      "<strong><strong>Configure Icon Visibility</strong></strong>" +
      "<em> for each command.</em>" +
      "</p>";
    const md = await htmlToMarkdown(html);
    assert.ok(!md.includes("&#x20;"), "should not emit plain-space entities");
    assert.ok(!md.includes("&#xA0;"), "should not emit nbsp entities");
    assert.ok(
      md.includes(" are "),
      "should preserve regular spaces as literal spaces",
    );
    assert.ok(
      !md.includes("&#x20;"),
      "should not emit numeric space entities in split-mark cases",
    );
  });

  test("intentional escaped entities are preserved", async () => {
    const html = "<p><code>&amp;#x20;</code> <code>&amp;#xA0;</code></p>";
    const md = await htmlToMarkdown(html);
    assert.match(md, /`&#x20;`/);
    assert.match(md, /`&#xA0;`/);
  });

  test("strikethrough", async () => {
    const md = await htmlToMarkdown("<p><del>removed</del></p>");
    assert.strictEqual(md.trim(), "~~removed~~");
  });

  test("link", async () => {
    const md = await htmlToMarkdown(
      '<p><a href="https://example.com">click</a></p>',
    );
    assert.strictEqual(md.trim(), "[click](https://example.com)");
  });

  test("image", async () => {
    const md = await htmlToMarkdown('<p><img src="a.png" alt="pic"></p>');
    assert.strictEqual(md.trim(), "![pic](a.png)");
  });

  test("image data URL", async () => {
    const md = await htmlToMarkdown(
      '<p><img src="data:image/png;base64,AAAA" alt="pic"></p>',
    );
    assert.strictEqual(md.trim(), "![pic](data:image/png;base64,AAAA)");
  });

  test("table", async () => {
    const html =
      "<table><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>";
    const md = await htmlToMarkdown(html);
    assert.match(md, /\| X \|/);
    assert.match(md, /\| 1 \|/);
  });

  test("Tiptap task list HTML normalizes to GFM", async () => {
    const tiptapHtml =
      '<ul data-type="taskList">' +
      '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>todo</p></div></li>' +
      '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>done</p></div></li>' +
      "</ul>";
    const md = await htmlToMarkdown(tiptapHtml);
    assert.match(md, /\[ ] todo/);
    assert.match(md, /\[x] done/);
  });

  test("empty Tiptap taskItem preserves unchecked brackets", async () => {
    const tiptapHtml =
      '<ul data-type="taskList">' +
      '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li>' +
      "</ul>";
    const md = await htmlToMarkdown(tiptapHtml);
    assert.match(md, /^- \[ ]\s*$/m);
  });

  test("empty Tiptap taskItem with nested taskList does not produce double bullet", async () => {
    // Simulates the HTML Tiptap produces after pressing Enter at the end of a
    // task item that has nested children: an empty taskItem wrapping a nested taskList
    const tiptapHtml =
      '<ul data-type="taskList">' +
      '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>one</p></div></li>' +
      '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p>' +
      '<ul data-type="taskList">' +
      '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>two</p></div></li>' +
      "</ul></div></li></ul>";
    const md = await htmlToMarkdown(tiptapHtml);
    assert.ok(
      !md.includes("- -"),
      `should not produce double bullet pattern; got:\n${md}`,
    );
    assert.match(md, /\[ ] one/);
    assert.match(md, /\[x] two/);
  });

  test("Tiptap table HTML round-trips", async () => {
    const tiptapHtml =
      '<table><tbody><tr><th colspan="1" rowspan="1"><p>A</p></th></tr>' +
      '<tr><td colspan="1" rowspan="1"><p>1</p></td></tr></tbody></table>';
    const md = await htmlToMarkdown(tiptapHtml);
    assert.match(md, /\| A \|/);
    assert.match(md, /\| 1 \|/);
  });

  test("bullet list is tight", async () => {
    const md = await htmlToMarkdown("<ul><li>a</li><li>b</li></ul>");
    assert.strictEqual(md.trim(), "- a\n- b");
  });

  test("uses dash bullets", async () => {
    const md = await htmlToMarkdown("<ul><li>item</li></ul>");
    assert.match(md, /^- /m);
  });

  test("data-href link converts to markdown link", async () => {
    const html = '<p><a data-href="https://example.com">click</a></p>';
    const md = await htmlToMarkdown(html);
    assert.strictEqual(md.trim(), "[click](https://example.com)");
  });
});

suite("GFM round-trip", () => {
  test("strikethrough survives round-trip", async () => {
    assert.strictEqual(await roundTrip("~~gone~~"), "~~gone~~");
  });

  test("split strikethrough around link normalizes", async () => {
    const input = "~~See [doc](https://example.com/docs) now~~";
    const once = await roundTrip(input);
    const twice = await roundTrip(once);
    assert.ok(once.includes("[doc](https://example.com/docs)"));
    assert.strictEqual(twice, once);
  });

  test("strikethrough with nested strong stays stable", async () => {
    const input = "~~left **bold** right~~";
    const once = await roundTrip(input);
    const twice = await roundTrip(once);
    assert.ok(once.includes("**bold**"));
    assert.strictEqual(twice, once);
  });

  test("table survives round-trip", async () => {
    const input = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const result = await roundTrip(input);
    assert.match(result, /\| A\s+\| B\s+\|/);
    assert.match(result, /\| 1\s+\| 2\s+\|/);
  });

  test("task list survives round-trip", async () => {
    const input = "- [ ] todo\n- [x] done";
    const result = await roundTrip(input);
    assert.match(result, /\[ ] todo/);
    assert.match(result, /\[x] done/);
  });

  test("autolink survives round-trip", async () => {
    const result = await roundTrip("https://example.com");
    // May come back as bare URL or angle-bracket autolink; both are valid GFM
    assert.match(result, /https:\/\/example\.com/);
  });

  test("normalization is idempotent for split inline marks", async () => {
    const input =
      "_Note that in Cursor 2.1+, editor action icons are [hidden by default](https://forum.cursor.com/t/editor-actions-icons-disappeared-in-2-1-0-version/143207). To show them, click on the three dots in the editor tab bar menu and select **Configure Icon Visibility** for each command._";
    const once = await roundTrip(input);
    const twice = await roundTrip(once);
    assert.strictEqual(twice, once);
  });
});

suite("GFM inline round-trip corpus", () => {
  for (const testCase of inlineRoundTripCases) {
    test(testCase.name, async () => {
      const result = await roundTrip(testCase.input);
      assertRoundTripInvariants(result, testCase.name);
      for (const expected of testCase.mustContain ?? []) {
        assert.ok(
          result.includes(expected),
          `${testCase.name}: missing "${expected}"`,
        );
      }
      for (const forbidden of testCase.mustNotContain ?? []) {
        assert.ok(
          !result.includes(forbidden),
          `${testCase.name}: contains forbidden "${forbidden}"`,
        );
      }
    });
  }
});

suite("GFM inline round-trip generated combinations", () => {
  for (const generated of buildGeneratedInlineCases()) {
    test(generated.name, async () => {
      const result = await roundTrip(generated.input);
      assertRoundTripInvariants(result, generated.name);
      for (const expected of generated.mustContain) {
        assert.ok(
          result.includes(expected),
          `${generated.name}: missing "${expected}"`,
        );
      }
    });
  }
});

suite("extractHtmlComments", () => {
  test("no comments returns empty and full body", () => {
    const { comments, body } = extractHtmlComments("# Title\n\nBody");
    assert.strictEqual(comments, "");
    assert.strictEqual(body, "# Title\n\nBody");
  });

  test("single leading comment", () => {
    const input = "<!-- note -->\n\n# Title";
    const { comments, body } = extractHtmlComments(input);
    assert.strictEqual(comments, "<!-- note -->");
    assert.strictEqual(body, "# Title");
  });

  test("multiple leading comments", () => {
    const input = "<!-- a -->\n<!-- b -->\n\n# Title";
    const { comments, body } = extractHtmlComments(input);
    assert.strictEqual(comments, "<!-- a -->\n<!-- b -->");
    assert.strictEqual(body, "# Title");
  });

  test("inline comment is not extracted", () => {
    const input = "# Title\n\n<!-- inline -->\n\nBody";
    const { comments, body } = extractHtmlComments(input);
    assert.strictEqual(comments, "");
    assert.strictEqual(body, input);
  });
});

suite("restoreHtmlComments", () => {
  test("empty comments returns markdown unchanged", () => {
    assert.strictEqual(restoreHtmlComments("", "# Title"), "# Title");
  });

  test("prepends comments with blank line separator", () => {
    const result = restoreHtmlComments("<!-- note -->", "# Title");
    assert.strictEqual(result, "<!-- note -->\n\n# Title");
  });
});
