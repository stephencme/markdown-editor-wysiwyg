import { Editor } from "@tiptap/core";

function insertImage(editor: Editor, src: string, alt?: string): void {
  if (!src) return;
  editor.chain().focus().setImage({ src, alt }).run();
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const { result } = reader;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("File reader did not return a string data URL"));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function bindImageInput(editor: Editor): void {
  editor.view.dom.addEventListener("paste", async (event) => {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItems = items.filter(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    if (imageItems.length === 0) return;

    event.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      const src = await fileToDataUrl(file);
      insertImage(editor, src, file.name);
    }
  });
}

export { bindImageInput };
