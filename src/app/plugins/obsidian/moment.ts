// A compact `moment`-compatible shim. Many plugins `import { moment }`
// from the plugin API — mostly for date formatting and arithmetic. We ship
// a small implementation rather than the full library; it covers the
// surface plugins actually lean on: parsing,
// `format()` with the common tokens, add/subtract, start/end-of, comparison,
// diffing, and the field accessors. It is intentionally not a full moment.

type Unit =
  | "year"
  | "years"
  | "y"
  | "month"
  | "months"
  | "M"
  | "week"
  | "weeks"
  | "w"
  | "day"
  | "days"
  | "d"
  | "hour"
  | "hours"
  | "h"
  | "minute"
  | "minutes"
  | "m"
  | "second"
  | "seconds"
  | "s"
  | "millisecond"
  | "milliseconds"
  | "ms";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n: number, len = 2): string => String(Math.abs(n)).padStart(len, "0");

const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th");
};

const normalizeUnit = (unit: Unit): string => {
  const u = unit.toLowerCase();
  if (u.startsWith("year") || u === "y") return "year";
  if (u === "month" || u === "months" || u === "m" || unit === "M") return "month";
  if (u.startsWith("week") || u === "w") return "week";
  if (u.startsWith("day") || u === "d") return "day";
  if (u.startsWith("hour") || u === "h") return "hour";
  if (u === "minute" || u === "minutes" || u === "m") return "minute";
  if (u.startsWith("second") || u === "s") return "second";
  return "millisecond";
};

class NarrativeMoment {
  private _d: Date;
  private _valid: boolean;

  constructor(input?: NarrativeMoment | Date | string | number, format?: string) {
    if (input === undefined) {
      this._d = new Date();
      this._valid = true;
    } else if (input instanceof NarrativeMoment) {
      this._d = new Date(input._d.getTime());
      this._valid = input._valid;
    } else if (input instanceof Date) {
      this._d = new Date(input.getTime());
      this._valid = !Number.isNaN(this._d.getTime());
    } else if (typeof input === "number") {
      this._d = new Date(input);
      this._valid = !Number.isNaN(this._d.getTime());
    } else {
      // String. `format` is accepted but only loosely honoured — we lean on
      // Date parsing, then on a couple of common explicit layouts.
      const parsed = NarrativeMoment.parseString(input, format);
      this._d = parsed;
      this._valid = !Number.isNaN(parsed.getTime());
    }
  }

  private static parseString(input: string, format?: string): Date {
    if (format) {
      // Handle the overwhelmingly common YYYY-MM-DD style layouts.
      const order: number[] = [];
      const tokens = format.match(/Y+|M+|D+|H+|m+|s+/g) ?? [];
      const nums = input.match(/\d+/g)?.map(Number) ?? [];
      let yi = 0;
      let mi = 0;
      let di = 0;
      let hi = 0;
      let mni = 0;
      let si = 0;
      tokens.forEach((tok, idx) => {
        const val = nums[idx] ?? 0;
        if (tok.startsWith("Y")) yi = val;
        else if (tok.startsWith("M")) mi = val;
        else if (tok.startsWith("D")) di = val;
        else if (tok.startsWith("H")) hi = val;
        else if (tok.startsWith("m")) mni = val;
        else if (tok.startsWith("s")) si = val;
      });
      void order;
      if (yi) return new Date(yi, Math.max(0, mi - 1), di || 1, hi, mni, si);
    }
    const direct = new Date(input);
    return direct;
  }

  isValid(): boolean {
    return this._valid;
  }

  clone(): NarrativeMoment {
    return new NarrativeMoment(this);
  }

  toDate(): Date {
    return new Date(this._d.getTime());
  }

  valueOf(): number {
    return this._d.getTime();
  }

  unix(): number {
    return Math.floor(this._d.getTime() / 1000);
  }

  toISOString(): string {
    return this._d.toISOString();
  }

  toString(): string {
    return this._d.toString();
  }

  // `local()` / `utc()` are accepted for API compatibility; this shim is
  // always local time.
  local(): this {
    return this;
  }
  utc(): this {
    return this;
  }

  year(): number {
    return this._d.getFullYear();
  }
  month(): number {
    return this._d.getMonth();
  }
  date(): number {
    return this._d.getDate();
  }
  day(): number {
    return this._d.getDay();
  }
  weekday(): number {
    return this._d.getDay();
  }
  hour(): number {
    return this._d.getHours();
  }
  hours(): number {
    return this._d.getHours();
  }
  minute(): number {
    return this._d.getMinutes();
  }
  minutes(): number {
    return this._d.getMinutes();
  }
  second(): number {
    return this._d.getSeconds();
  }
  seconds(): number {
    return this._d.getSeconds();
  }
  millisecond(): number {
    return this._d.getMilliseconds();
  }
  dayOfYear(): number {
    const start = new Date(this._d.getFullYear(), 0, 0);
    return Math.floor((this._d.getTime() - start.getTime()) / 86400000);
  }
  daysInMonth(): number {
    return new Date(this._d.getFullYear(), this._d.getMonth() + 1, 0).getDate();
  }
  week(): number {
    const d = new Date(this._d.getTime());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    return (
      1 +
      Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
    );
  }
  isoWeek(): number {
    return this.week();
  }

  add(amount: number, unit: Unit): this {
    const u = normalizeUnit(unit);
    if (u === "year") this._d.setFullYear(this._d.getFullYear() + amount);
    else if (u === "month") this._d.setMonth(this._d.getMonth() + amount);
    else if (u === "week") this._d.setDate(this._d.getDate() + amount * 7);
    else if (u === "day") this._d.setDate(this._d.getDate() + amount);
    else if (u === "hour") this._d.setHours(this._d.getHours() + amount);
    else if (u === "minute") this._d.setMinutes(this._d.getMinutes() + amount);
    else if (u === "second") this._d.setSeconds(this._d.getSeconds() + amount);
    else this._d.setMilliseconds(this._d.getMilliseconds() + amount);
    return this;
  }

  subtract(amount: number, unit: Unit): this {
    return this.add(-amount, unit);
  }

  startOf(unit: Unit): this {
    const u = normalizeUnit(unit);
    const d = this._d;
    if (u === "year") d.setMonth(0, 1);
    if (u === "year" || u === "month") d.setDate(1);
    if (u === "week") d.setDate(d.getDate() - d.getDay());
    if (u === "year" || u === "month" || u === "week" || u === "day") d.setHours(0, 0, 0, 0);
    else if (u === "hour") d.setMinutes(0, 0, 0);
    else if (u === "minute") d.setSeconds(0, 0);
    else if (u === "second") d.setMilliseconds(0);
    return this;
  }

  endOf(unit: Unit): this {
    const u = normalizeUnit(unit);
    this.startOf(unit);
    if (u === "year") this.add(1, "year");
    else if (u === "month") this.add(1, "month");
    else if (u === "week") this.add(1, "week");
    else if (u === "day") this.add(1, "day");
    else if (u === "hour") this.add(1, "hour");
    else if (u === "minute") this.add(1, "minute");
    else this.add(1, "second");
    this._d.setMilliseconds(this._d.getMilliseconds() - 1);
    return this;
  }

  diff(other: NarrativeMoment | Date | string | number, unit?: Unit, precise = false): number {
    const o = other instanceof NarrativeMoment ? other : new NarrativeMoment(other);
    const ms = this._d.getTime() - o._d.getTime();
    if (!unit) return ms;
    const u = normalizeUnit(unit);
    const divisor: Record<string, number> = {
      year: 31536000000,
      month: 2592000000,
      week: 604800000,
      day: 86400000,
      hour: 3600000,
      minute: 60000,
      second: 1000,
      millisecond: 1,
    };
    const raw = ms / (divisor[u] ?? 1);
    return precise ? raw : Math.trunc(raw);
  }

  isSame(other: NarrativeMoment | Date | string | number, unit?: Unit): boolean {
    const o = other instanceof NarrativeMoment ? other : new NarrativeMoment(other);
    if (!unit) return this._d.getTime() === o._d.getTime();
    return this.clone().startOf(unit).valueOf() === o.clone().startOf(unit).valueOf();
  }
  isBefore(other: NarrativeMoment | Date | string | number, unit?: Unit): boolean {
    const o = other instanceof NarrativeMoment ? other : new NarrativeMoment(other);
    if (!unit) return this._d.getTime() < o._d.getTime();
    return this.clone().startOf(unit).valueOf() < o.clone().startOf(unit).valueOf();
  }
  isAfter(other: NarrativeMoment | Date | string | number, unit?: Unit): boolean {
    const o = other instanceof NarrativeMoment ? other : new NarrativeMoment(other);
    if (!unit) return this._d.getTime() > o._d.getTime();
    return this.clone().startOf(unit).valueOf() > o.clone().startOf(unit).valueOf();
  }
  isSameOrBefore(other: NarrativeMoment | Date | string | number, unit?: Unit): boolean {
    return this.isSame(other, unit) || this.isBefore(other, unit);
  }
  isSameOrAfter(other: NarrativeMoment | Date | string | number, unit?: Unit): boolean {
    return this.isSame(other, unit) || this.isAfter(other, unit);
  }
  isBetween(
    a: NarrativeMoment | Date | string | number,
    b: NarrativeMoment | Date | string | number,
    unit?: Unit,
  ): boolean {
    return this.isAfter(a, unit) && this.isBefore(b, unit);
  }

  format(fmt = "YYYY-MM-DDTHH:mm:ssZ"): string {
    const d = this._d;
    const tzMin = -d.getTimezoneOffset();
    const tzSign = tzMin >= 0 ? "+" : "-";
    const tz = `${tzSign}${pad(Math.floor(Math.abs(tzMin) / 60))}:${pad(Math.abs(tzMin) % 60)}`;
    const h12 = d.getHours() % 12 || 12;
    const tokens: Record<string, string> = {
      YYYY: String(d.getFullYear()),
      YY: pad(d.getFullYear() % 100),
      MMMM: MONTHS[d.getMonth()] ?? "",
      MMM: (MONTHS[d.getMonth()] ?? "").slice(0, 3),
      MM: pad(d.getMonth() + 1),
      M: String(d.getMonth() + 1),
      DD: pad(d.getDate()),
      Do: ordinal(d.getDate()),
      D: String(d.getDate()),
      dddd: DAYS[d.getDay()] ?? "",
      ddd: (DAYS[d.getDay()] ?? "").slice(0, 3),
      dd: (DAYS[d.getDay()] ?? "").slice(0, 2),
      HH: pad(d.getHours()),
      H: String(d.getHours()),
      hh: pad(h12),
      h: String(h12),
      mm: pad(d.getMinutes()),
      m: String(d.getMinutes()),
      ss: pad(d.getSeconds()),
      s: String(d.getSeconds()),
      SSS: pad(d.getMilliseconds(), 3),
      A: d.getHours() < 12 ? "AM" : "PM",
      a: d.getHours() < 12 ? "am" : "pm",
      X: String(this.unix()),
      x: String(d.getTime()),
      ZZ: tz.replace(":", ""),
      Z: tz,
      ww: pad(this.week()),
      w: String(this.week()),
      gggg: String(d.getFullYear()),
      GGGG: String(d.getFullYear()),
    };
    // Match longest tokens first; `[...]` escapes literal text.
    return fmt.replace(
      /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|Do|D|dddd|ddd|dd|HH|H|hh|h|mm|m|ss|s|SSS|A|a|X|x|ZZ|Z|ww|w|gggg|GGGG/g,
      (match, literal?: string) => (literal !== undefined ? literal : (tokens[match] ?? match)),
    );
  }

  fromNow(withoutSuffix = false): string {
    const ms = Date.now() - this._d.getTime();
    const future = ms < 0;
    const abs = Math.abs(ms);
    const units: [number, string][] = [
      [31536000000, "year"],
      [2592000000, "month"],
      [604800000, "week"],
      [86400000, "day"],
      [3600000, "hour"],
      [60000, "minute"],
      [1000, "second"],
    ];
    let phrase = "a few seconds";
    for (const [size, name] of units) {
      if (abs >= size) {
        const n = Math.round(abs / size);
        phrase = `${n} ${name}${n === 1 ? "" : "s"}`;
        break;
      }
    }
    if (withoutSuffix) return phrase;
    return future ? `in ${phrase}` : `${phrase} ago`;
  }

  calendar(): string {
    return this.format("YYYY-MM-DD HH:mm");
  }
}

type MomentFactory = {
  (input?: NarrativeMoment | Date | string | number, format?: string): NarrativeMoment;
  unix: (seconds: number) => NarrativeMoment;
  utc: (input?: NarrativeMoment | Date | string | number) => NarrativeMoment;
  isMoment: (value: unknown) => value is NarrativeMoment;
  now: () => number;
  duration: (
    amount: number,
    unit?: Unit,
  ) => { asMilliseconds: () => number; asSeconds: () => number };
};

const moment = ((input?: NarrativeMoment | Date | string | number, format?: string) =>
  new NarrativeMoment(input, format)) as MomentFactory;

moment.unix = (seconds: number): NarrativeMoment => new NarrativeMoment(seconds * 1000);
moment.utc = (input?: NarrativeMoment | Date | string | number): NarrativeMoment =>
  new NarrativeMoment(input);
moment.isMoment = (value: unknown): value is NarrativeMoment => value instanceof NarrativeMoment;
moment.now = (): number => Date.now();
moment.duration = (amount: number, unit: Unit = "millisecond") => {
  const divisor: Record<string, number> = {
    year: 31536000000,
    month: 2592000000,
    week: 604800000,
    day: 86400000,
    hour: 3600000,
    minute: 60000,
    second: 1000,
    millisecond: 1,
  };
  const ms = amount * (divisor[normalizeUnit(unit)] ?? 1);
  return { asMilliseconds: () => ms, asSeconds: () => ms / 1000 };
};

export type { Unit as MomentUnit };
export { moment, NarrativeMoment };
