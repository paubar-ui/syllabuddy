// Reads the text out of a PDF in the browser. Only the text is ever sent anywhere.
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; // copied by scripts/copy-pdf-worker.mjs

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let text = "";
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const { str, transform } = item as TextItem;
      const y = transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) text += "\n";
      else if (text && !text.endsWith(" ") && !str.startsWith(" ")) text += " ";
      text += str;
      lastY = y;
    }
    pages.push(text);
  }
  await task.destroy();
  return pages.join("\n");
}
