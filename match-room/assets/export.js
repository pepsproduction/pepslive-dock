import { buildExcelXml, formatMatchText } from "./room-model.js";

export async function copyMatch(meta, current) {
  const output = formatMatchText(meta, current);
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(output);
    return output;
  }
  const textarea = document.createElement("textarea");
  textarea.value = output;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("clipboard_unavailable");
  return output;
}

export function exportExcel(meta, current, matches) {
  const xml = buildExcelXml(meta, current, matches);
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `pepslive-match-room-${meta.roomCode || "room"}.xml`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
  return { filename: anchor.download, bytes: blob.size };
}
