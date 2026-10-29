import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { db } from "@/db";
import { emailTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { DEFAULT_TEMPLATES, PLACEHOLDERS, TEMPLATE_INFO, type TemplateKey } from "@/lib/email/templates";
import { resetTemplate, saveTemplate } from "../actions";

export const metadata: Metadata = { title: "Textes des emails" };

export default async function TemplatesPage() {
  await requireUser();
  const custom = new Map((await db.select().from(emailTemplates)).map((t) => [t.key, t]));
  const keys = Object.keys(DEFAULT_TEMPLATES).filter((k) => k !== "test") as TemplateKey[];

  return (
    <>
      <PageHeader
        title="Textes des emails"
        description="Les mots entre {{accolades}} sont remplacés automatiquement pour chaque exposant."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,48rem)_1fr]">
        <div className="space-y-6">
          {keys.map((key) => {
            const t = custom.get(key) ?? DEFAULT_TEMPLATES[key];
            return (
              <Card key={key}>
                <h2 className="font-semibold">
                  {TEMPLATE_INFO[key].label} {custom.has(key) && <Badge tone="blue">modifié</Badge>}
                </h2>
                <p className="mb-3 text-sm text-slate-600">{TEMPLATE_INFO[key].description}</p>
                <ActionForm action={saveTemplate.bind(null, key)} className="space-y-3">
                  <Field label="Sujet">
                    <Input name="subject" defaultValue={t.subject} />
                  </Field>
                  <Field label="Texte">
                    <Textarea name="body" rows={12} defaultValue={t.body} className="font-mono text-xs" />
                  </Field>
                </ActionForm>
                {custom.has(key) && (
                  <form action={resetTemplate.bind(null, key)} className="mt-2">
                    <button className="text-xs text-slate-500 underline">Revenir au texte d’origine</button>
                  </form>
                )}
              </Card>
            );
          })}
        </div>
        <Card className="self-start xl:sticky xl:top-4">
          <h2 className="mb-2 font-semibold">Mots remplacés</h2>
          <dl className="space-y-1 text-sm">
            {Object.entries(PLACEHOLDERS).map(([k, v]) => (
              <div key={k}>
                <dt className="text-brand-700 inline font-mono text-xs">{`{{${k}}}`}</dt>{" "}
                <dd className="inline text-slate-600">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
