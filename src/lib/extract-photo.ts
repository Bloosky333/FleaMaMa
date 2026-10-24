import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ImportRowData } from "./import";

const MODEL = "claude-opus-5-5";

const ExtractedRow = z.object({
  spots: z.string().describe("Spot number(s) exactly as shown, e.g. '41' or '41-43'"),
  lastName: z.string(),
  firstName: z.string(),
  company: z.string(),
  street: z.string(),
  houseNumber: z.string(),
  postcode: z.string(),
  city: z.string(),
  phone: z.string(),
  email: z.string(),
  kind: z.enum(["", "private", "pro"]),
  paid: z.enum(["", "oui", "non"]),
  notes: z.string(),
  uncertain: z
    .array(z.string())
    .describe("Names of the fields above that are hard to read or ambiguous in the photo"),
});

const Extraction = z.object({
  rows: z.array(ExtractedRow),
  comment: z.string().describe("Short remark in French about the photo quality or layout, or empty"),
});

const PROMPT = `This is a phone photo of a computer screen showing an old FileMaker database used by the organiser of a Belgian flea market (brocante). It lists exhibitors ("exposants") and the market spot(s) ("emplacement", numbers) they rented, possibly with address, phone, email and whether they paid.

Extract every exhibitor row visible in the photo, top to bottom, into the requested JSON fields:
- Copy values exactly as displayed; do not translate, complete or invent anything. Use "" when a field is not shown.
- spots: the spot number(s) as shown (e.g. "41", "41-43", "12bis").
- lastName / firstName: split the person's name; if only a company name is shown, put it in company.
- kind: "pro" only if the row clearly marks a professional/trader, "private" if clearly a private person, otherwise "".
- paid: "oui" if the row is marked as paid, "non" if marked as unpaid, otherwise "".
- notes: any other visible remark for that row.
- uncertain: list the field names whose value you could not read with confidence (blur, glare, cut off).
Skip column headers, menus and rows cut off so badly that no name is readable.`;

export type ExtractedRows = { rows: (ImportRowData & { uncertain: string[] })[]; comment: string };

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function extractRowsFromPhoto(
  image: Buffer,
  mime: "image/jpeg" | "image/png" | "image/webp",
): Promise<ExtractedRows> {
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // On a safety decline, let the API retry on its recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(Extraction) },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime, data: image.toString("base64") } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("L’IA a refusé de lire cette photo.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Trop de lignes sur cette photo : prenez des photos plus serrées (± 20 lignes).");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Réponse illisible de l’IA, réessayez.");

  const fields = new Set(Object.keys(ExtractedRow.shape));
  return {
    comment: parsed.comment,
    rows: parsed.rows.map(({ uncertain, ...row }) => ({
      ...row,
      uncertain: uncertain.filter((f) => fields.has(f)),
    })),
  };
}

/** Friendly French message for an extraction failure. */
export function extractionErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Clé API Anthropic invalide.";
  if (err instanceof Anthropic.RateLimitError) return "Trop de demandes à l’IA, réessayez dans une minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Impossible de joindre le service d’IA.";
  if (err instanceof Anthropic.APIError) return `Erreur du service d’IA (${err.status}).`;
  return err instanceof Error ? err.message : "Erreur inconnue.";
}
