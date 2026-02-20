import * as assert from "assert";
import {
  extractHtmlComments,
  htmlToMarkdown,
  markdownToHtml,
  restoreHtmlComments,
} from "../markdown.js";

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
    assert.match(html, /type="checkbox"/);
    assert.match(html, /checked/);
    assert.match(html, /todo/);
    assert.match(html, /done/);
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
});

suite("GFM round-trip", () => {
  async function roundTrip(md: string): Promise<string> {
    const html = await markdownToHtml(md);
    return (await htmlToMarkdown(html)).trim();
  }

  test("strikethrough survives round-trip", async () => {
    assert.strictEqual(await roundTrip("~~gone~~"), "~~gone~~");
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
