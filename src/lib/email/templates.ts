/** Built-in email templates (French, plain text). Organisers can override them in the settings. */

export type TemplateKey = "invitation" | "invitation_reminder" | "confirmation" | "unpaid_reminder" | "test";

export type Template = { subject: string; body: string };

export const TEMPLATE_INFO: Record<TemplateKey, { label: string; description: string }> = {
  invitation: {
    label: "Invitation prioritaire",
    description: "Envoyée aux riverains et aux exposants de l’an dernier pour confirmer leur emplacement.",
  },
  invitation_reminder: {
    label: "Rappel d’invitation",
    description: "Relance de ceux qui n’ont pas encore répondu avant la date limite.",
  },
  confirmation: {
    label: "Confirmation et paiement",
    description: "Envoyée automatiquement quand un exposant confirme.",
  },
  unpaid_reminder: { label: "Rappel de paiement", description: "Relance des réservations non payées." },
  test: { label: "Email de test", description: "Pour vérifier la configuration Gmail." },
};

export const PLACEHOLDERS: Record<string, string> = {
  prenom: "Prénom de l’exposant",
  nom: "Nom de l’exposant",
  annee: "Année de la brocante",
  date_brocante: "Date de la brocante",
  emplacements: "Numéros d’emplacement, ex. « 1 et 2 »",
  emplacement_s: "« l’emplacement n°5 » ou « les emplacements n°1 et 2 »",
  date_limite: "Date limite pour confirmer",
  lien: "Lien personnel de l’exposant",
  montant: "Montant à payer",
  reference: "Référence de la réservation",
  instructions_paiement: "Instructions de paiement (paramètres)",
  organisateur: "Nom de l’organisateur",
  raison: "« vous habitez juste en face » ou « vous l’aviez l’an dernier »",
};

export const DEFAULT_TEMPLATES: Record<TemplateKey, Template> = {
  invitation: {
    subject: "Brocante {{annee}} : nous vous réservons {{emplacement_s}}",
    body: `Bonjour {{prenom}},

La brocante aura lieu le {{date_brocante}}.

Comme {{raison}}, nous vous réservons {{emplacement_s}} jusqu’au {{date_limite}}.

Pour confirmer (ou nous dire que vous ne venez pas), cliquez sur votre lien personnel :
{{lien}}

Sans réponse de votre part à cette date, nous proposerons {{emplacement_s}} à d’autres exposants.

À bientôt,
{{organisateur}}`,
  },
  invitation_reminder: {
    subject: "Rappel – Brocante {{annee}} : confirmez votre emplacement avant le {{date_limite}}",
    body: `Bonjour {{prenom}},

Nous n’avons pas encore reçu votre réponse pour {{emplacement_s}} à la brocante du {{date_brocante}}.

Il vous reste jusqu’au {{date_limite}} pour confirmer :
{{lien}}

À bientôt,
{{organisateur}}`,
  },
  confirmation: {
    subject: "Brocante {{annee}} : réservation confirmée (n°{{emplacements}})",
    body: `Bonjour {{prenom}},

Votre réservation est confirmée : {{emplacement_s}}, le {{date_brocante}}.

Montant : {{montant}}
Référence à indiquer : {{reference}}

{{instructions_paiement}}

Vous pouvez revoir votre réservation à tout moment :
{{lien}}

Merci et à bientôt,
{{organisateur}}`,
  },
  unpaid_reminder: {
    subject: "Brocante {{annee}} : rappel de paiement ({{reference}})",
    body: `Bonjour {{prenom}},

Sauf erreur de notre part, nous n’avons pas encore reçu le paiement pour {{emplacement_s}} ({{montant}}).

Référence à indiquer : {{reference}}

{{instructions_paiement}}

Si vous avez déjà payé, merci de ne pas tenir compte de ce message.

{{organisateur}}`,
  },
  test: {
    subject: "FleaMaMa : email de test",
    body: `Bonjour,

Si vous lisez ce message, l’envoi d’emails depuis FleaMaMa fonctionne.

{{organisateur}}`,
  },
};

/** Replaces {{placeholders}}; unknown ones are left visible so mistakes are noticed. */
export function renderTemplate(template: Template, vars: Record<string, string>): Template {
  const fill = (s: string) =>
    s.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k] : m));
  return { subject: fill(template.subject).replace(/\s+/g, " ").trim(), body: fill(template.body) };
}

export function isTemplateKey(k: string): k is TemplateKey {
  return k in DEFAULT_TEMPLATES;
}
