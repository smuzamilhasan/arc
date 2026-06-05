import type { Post } from "@workspace/api-client-react";

// Client-side export of the content plan for schedulers without an API. No
// server round-trip — we build the file from the posts already loaded in the
// page and trigger a browser download.

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  // Quote and escape per RFC 4180 when the value contains a comma, quote, or newline.
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportPostsCsv(posts: Post[], filename = "content-plan.csv") {
  const header = ["Title", "Content", "Platform", "Status", "Scheduled At", "Sent To", "Sent At"];
  const rows = posts.map((p) =>
    [
      p.title,
      p.content,
      p.platform,
      p.status,
      p.scheduledAt ?? "",
      p.handoffProvider ?? "",
      p.handoffAt ?? "",
    ]
      .map((c) => csvCell(String(c)))
      .join(","),
  );
  triggerDownload([header.join(","), ...rows].join("\r\n"), filename, "text/csv;charset=utf-8");
}

// Format a Date as an ICS UTC timestamp: YYYYMMDDTHHMMSSZ.
function toIcsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function exportPostsIcs(posts: Post[], filename = "content-plan.ics") {
  const scheduled = posts.filter((p) => p.scheduledAt);
  const now = toIcsDate(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//arc//Content Plan//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const p of scheduled) {
    const start = new Date(p.scheduledAt as string);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:arc-post-${p.id}@arc`,
      `DTSTAMP:${now}`,
      `DTSTART:${toIcsDate(start)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${icsEscape(`[${p.platform}] ${p.title}`)}`,
      `DESCRIPTION:${icsEscape(p.content)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  triggerDownload(lines.join("\r\n"), filename, "text/calendar;charset=utf-8");
}
