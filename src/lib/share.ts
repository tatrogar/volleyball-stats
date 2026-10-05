export type SaveOutcome = "shared" | "downloaded" | "cancelled";

/**
 * Hands a file to the iPad share sheet (Save to Files, AirDrop, Mail…). Where
 * the share sheet can't take files, falls back to a normal download.
 */
export async function saveFile(contents: string, fileName: string, mimeType: string): Promise<SaveOutcome> {
  const file = new File([contents], fileName, { type: mimeType });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // Some browsers refuse share() outside a fresh tap; fall through to download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
