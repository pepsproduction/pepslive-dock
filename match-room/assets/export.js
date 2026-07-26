import { buildExcelXml, formatMatchText } from "./room-model.js";

export async function copyText(value) {
  const output = String(value ?? "");
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

export async function copyMatch(meta, current) {
  const output = formatMatchText(meta, current);
  return copyText(output);
}

export function formatTeamsText(match = {}) {
  return `${String(match.teamAName || "TEAM A").trim()} vs ${String(match.teamBName || "TEAM B").trim()}`;
}

export function formatResultText(match = {}) {
  const scoreA = Math.max(0, Math.min(999, Math.floor(Number(match.scoreA) || 0)));
  const scoreB = Math.max(0, Math.min(999, Math.floor(Number(match.scoreB) || 0)));
  return `${String(match.teamAName || "TEAM A").trim()} ${scoreA}-${scoreB} ${String(match.teamBName || "TEAM B").trim()}`;
}

export function copyTeams(match) {
  return copyText(formatTeamsText(match));
}

export function copyResult(match) {
  return copyText(formatResultText(match));
}

function xml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function excelCell(value, type = "String") {
  return `<Cell><Data ss:Type="${type}">${xml(value)}</Data></Cell>`;
}

function excelRow(values) {
  return `<Row>${values.map(([value, type]) => excelCell(value, type)).join("")}</Row>`;
}

function buildScheduleExcelXml(meta = {}, scheduleRows = []) {
  const rows = [
    [["PepsLive Match Room", "String"], [meta.roomCode || "", "String"]],
    [["รายการ", "String"], [meta.eventName || "", "String"]],
    [["สถานที่", "String"], [meta.venue || "", "String"]],
    [["รอบ", "String"], [meta.round || "", "String"], ["กลุ่ม", "String"], [meta.group || "", "String"]],
    [],
    [["Order", "String"], ["Match ID", "String"], ["Team A", "String"], ["Score A", "String"], ["Score B", "String"], ["Team B", "String"], ["Status", "String"], ["Winner", "String"], ["Label 1", "String"], ["Label 2", "String"], ["Label 3", "String"], ["Label 4", "String"], ["Label 5", "String"]]
  ];

  for (const [index, match] of scheduleRows.entries()) {
    const showScore = Boolean(match.hasScore || match.hasResult || match.isCurrent);
    rows.push([
      [Number.isFinite(Number(match.order)) ? Number(match.order) : index + 1, "Number"],
      [match.matchId || "", "String"],
      [match.teamAName || "", "String"],
      [showScore ? Number(match.scoreA || 0) : "", showScore ? "Number" : "String"],
      [showScore ? Number(match.scoreB || 0) : "", showScore ? "Number" : "String"],
      [match.teamBName || "", "String"],
      [match.matchStatus || match.status || "", "String"],
      [match.winner || "", "String"],
      [match.label1 || "", "String"],
      [match.label2 || "", "String"],
      [match.label3 || "", "String"],
      [match.label4 || "", "String"],
      [match.label5 || "", "String"]
    ]);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Match Room"><Table>${rows.map(excelRow).join("")}</Table></Worksheet></Workbook>`;
}

export function exportExcel(meta, current, matches, scheduleRows = []) {
  const rows = Array.isArray(scheduleRows) ? scheduleRows : [];
  const xml = rows.length ? buildScheduleExcelXml(meta, rows) : buildExcelXml(meta, current, matches);
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `pepslive-match-room-${meta.roomCode || "room"}.xml`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
  return { filename: anchor.download, bytes: blob.size };
}
