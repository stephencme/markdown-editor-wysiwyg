export type InlineRoundTripCase = {
  name: string;
  input: string;
  mustContain?: string[];
  mustNotContain?: string[];
};

export const inlineRoundTripCases: InlineRoundTripCase[] = [
  {
    name: "valid nested formatting with NBSP is preserved",
    input:
      "_Note that in Cursor 2.1+, editor action icons are [hidden by default](https://forum.cursor.com/t/editor-actions-icons-disappeared-in-2-1-0-version/143207). To show them, click on the three dots in the editor tab bar menu and select **Configure Icon Visibility**\u00A0for each command._",
    mustContain: [
      "[hidden by default](https://forum.cursor.com/t/editor-actions-icons-disappeared-in-2-1-0-version/143207)",
      "**Configure Icon Visibility**",
    ],
    mustNotContain: ["\\***\\*", "&#x20;", "&#xA0;"],
  },
  {
    name: "corrupted emphasis entities are normalized",
    input:
      "*Note that in Cursor 2.1+, editor action icons are&#x20;*[*hidden by default*](https://forum.cursor.com/t/editor-actions-icons-disappeared-in-2-1-0-version/143207)*. To show them, click on the three dots in the editor tab bar menu and select&#x20;****Configure Icon Visibility****&#x20;for each command.*",
    mustContain: [
      "[hidden by default](https://forum.cursor.com/t/editor-actions-icons-disappeared-in-2-1-0-version/143207)",
      "Configure Icon Visibility",
    ],
    mustNotContain: ["&#x20;", "&#xA0;"],
  },
  {
    name: "escaped punctuation remains readable",
    input:
      "_Literal brackets \\[x\\] and literal stars \\*\\*not bold\\*\\* with [link](https://example.com)._",
    mustContain: ["[link](https://example.com)"],
  },
  {
    name: "unicode around emphasis boundaries",
    input: "_Emoji 😀 and CJK 漢字 with [link](https://example.com/u) text._",
    mustContain: ["[link](https://example.com/u)"],
  },
];
