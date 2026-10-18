export const DEFAULT_TEMPLATE = `Nuevo lead en Human Handoff
Lead: {{lead}}
Contacto: {{contact}}
Tel: {{phone}}
Tags: {{tags}}
{{link}}`;

/** Only keys present in `vars` are substituted; anything else (e.g. {{evil}}) is left as literal text. */
export const render = (template: string, vars: Record<string, string | undefined>) =>
  template.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] || "-" : m));

export const SAMPLE = {
  lead: "Maria Lopez - Clases de inglés",
  contact: "Maria Lopez",
  phone: "+34 600 123 456",
  tags: "Meta Ads, WhatsApp",
  link: "https://letjunior.kommo.com/leads/detail/123456",
};
