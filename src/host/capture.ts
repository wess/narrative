import type { WebCapture, WebCaptureInput } from "../shared/types.ts";
import { openAgentStore } from "./agents/store.ts";
import { createPage } from "./pages.ts";
import type { OpenVault } from "./vault/types.ts";

type Fetcher = (url: string) => Promise<Response>;

type ExtractedPage = {
  readonly title: string;
  readonly description: string;
  readonly text: string;
};

type WebCaptureRow = {
  readonly id: number;
  readonly url: string;
  readonly title: string;
  readonly pageId: number;
  readonly pageTitle: string;
  readonly createdAt: string;
};

const textOf = (html: string, pattern: RegExp): string => {
  const match = pattern.exec(html);
  return decodeEntities(match?.[1]?.trim() ?? "");
};

const decodeEntities = (value: string): string =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const stripHtml = (html: string): string =>
  decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|section|article|h[1-6]|li)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );

export const extractWebPage = (html: string, fallbackTitle: string): ExtractedPage => {
  const title = textOf(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || fallbackTitle;
  const description =
    textOf(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ||
    textOf(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["'][^>]*>/i);
  const text = stripHtml(html).slice(0, 5000);
  return { title, description, text };
};

const yamlValue = (value: string): string => JSON.stringify(value);

const captureBody = (
  url: string,
  title: string,
  description: string,
  notes: string,
  text: string,
): string => {
  const captured = new Date().toISOString();
  const parts = [
    "---",
    `source: ${yamlValue(url)}`,
    `captured: ${yamlValue(captured)}`,
    'type: "web"',
    "---",
    "",
    `Source: ${url}`,
  ];
  if (description) parts.push("", `> ${description}`);
  if (notes) parts.push("", "## Notes", "", notes);
  parts.push("", "## Capture", "", text || title);
  return `${parts.join("\n")}\n`;
};

const titleFromUrl = (url: URL): string => {
  const path = url.pathname
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return path || url.hostname;
};

const parseCaptureUrl = (raw: string): URL => {
  const trimmed = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withScheme);
};

export const captureWeb = async (
  vault: OpenVault,
  input: WebCaptureInput,
  fetcher: Fetcher = fetch,
): Promise<WebCapture | null> => {
  const parsed = parseCaptureUrl(input.url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs can be captured.");
  }
  const response = await fetcher(parsed.toString());
  if (!response.ok) throw new Error(`Capture failed with HTTP ${response.status}.`);
  const html = await response.text();
  const extracted = extractWebPage(html, input.title?.trim() || titleFromUrl(parsed));
  const title = input.title?.trim() || extracted.title;
  const notes = input.notes?.trim() ?? "";
  const page = await createPage(vault, {
    title,
    parentId: null,
    body: captureBody(parsed.toString(), title, extracted.description, notes, extracted.text),
  });
  const db = await openAgentStore(vault.root);
  db.exec(
    `INSERT INTO webCaptures
      (url, title, pageId, pageTitle, notes, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)`,
    parsed.toString(),
    title,
    page.id,
    page.title,
    notes,
    new Date().toISOString(),
  );
  const row = db.query<WebCaptureRow>("SELECT * FROM webCaptures ORDER BY id DESC LIMIT 1")[0];
  return row
    ? {
        id: row.id,
        url: row.url,
        title: row.title,
        pageId: row.pageId,
        pageTitle: row.pageTitle,
        createdAt: row.createdAt,
      }
    : null;
};

export const listWebCaptures = async (vaultRoot: string, limit = 100): Promise<WebCapture[]> => {
  const db = await openAgentStore(vaultRoot);
  return db
    .query<WebCaptureRow>(
      `SELECT * FROM webCaptures
        ORDER BY id DESC
        LIMIT ?`,
      Math.max(1, Math.min(limit, 300)),
    )
    .map((row) => ({
      id: row.id,
      url: row.url,
      title: row.title,
      pageId: row.pageId,
      pageTitle: row.pageTitle,
      createdAt: row.createdAt,
    }));
};
