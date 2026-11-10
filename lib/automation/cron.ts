// Minimal 5-field cron evaluator (UTC) used to DISPLAY the next scheduled run.
// Supports *, numbers, lists (1,3), ranges (1-5) and steps (*/15, 1-30/5).

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number.parseInt(stepText, 10) : 1;
    let start = min;
    let end = max;
    if (range !== "*") {
      const [a, b] = range.split("-").map((n) => Number.parseInt(n, 10));
      start = a;
      end = b ?? (stepText ? max : a);
    }
    if ([start, end, step].some((n) => Number.isNaN(n)) || start < min || end > max || step < 1) {
      throw new Error(`Invalid cron field "${field}"`);
    }
    for (let v = start; v <= end; v += step) values.add(v);
  }
  return values;
}

export function parseCron(expr: string) {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error("Cron expression must have 5 fields");
  const [m, h, dom, mon, dow] = fields;
  const dowSet = parseField(dow.replace(/7/g, "0"), 0, 6);
  return {
    minutes: parseField(m, 0, 59),
    hours: parseField(h, 0, 23),
    days: parseField(dom, 1, 31),
    months: parseField(mon, 1, 12),
    weekdays: dowSet,
    domAny: dom === "*",
    dowAny: dow === "*",
  };
}

/** Next run strictly after `from`, or null if none within ~400 days. */
export function nextRun(expr: string, from = new Date()): Date | null {
  const c = parseCron(expr);
  const d = new Date(from.getTime());
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);
  const limit = from.getTime() + 400 * 86_400_000;
  while (d.getTime() <= limit) {
    const dayMatch =
      c.domAny && c.dowAny
        ? true
        : c.domAny
          ? c.weekdays.has(d.getUTCDay())
          : c.dowAny
            ? c.days.has(d.getUTCDate())
            : c.days.has(d.getUTCDate()) || c.weekdays.has(d.getUTCDay()); // POSIX OR semantics
    if (!c.months.has(d.getUTCMonth() + 1) || !dayMatch) {
      d.setUTCDate(d.getUTCDate() + 1);
      d.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!c.hours.has(d.getUTCHours())) {
      d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
      continue;
    }
    if (!c.minutes.has(d.getUTCMinutes())) {
      d.setUTCMinutes(d.getUTCMinutes() + 1);
      continue;
    }
    return d;
  }
  return null;
}

export function describeCron(expr: string): string {
  const [m, h, dom, mon, dow] = expr.trim().split(/\s+/);
  const time = /^\d+$/.test(m) && /^\d+$/.test(h) ? `${h.padStart(2, "0")}:${m.padStart(2, "0")} UTC` : null;
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (time && dom === "*" && mon === "*" && dow === "*") return `Every day at ${time}`;
  if (time && dom === "*" && mon === "*" && /^\d$/.test(dow)) return `Every ${days[Number(dow) % 7]} at ${time}`;
  return expr;
}
