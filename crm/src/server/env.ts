// All config in one place. Getters read lazily so tests can set process.env first.
const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export const env = {
  get appUrl() { return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""); },
  get siteUrl() { return (process.env.SITE_URL ?? "https://etccrew.ca").replace(/\/$/, ""); },
  get businessSlug() { return process.env.BUSINESS_SLUG ?? "etc"; },
  get ownerEmails() { return list(process.env.OWNER_EMAILS).map((e) => e.toLowerCase()); },
  get ownerCc() { return list(process.env.OWNER_CC); },
  get publicOrigins() { return list(process.env.PUBLIC_SITE_ORIGINS); },
  get helpEmail() { return process.env.HELP_EMAIL ?? "help@etccrew.ca"; },
  get etransferEmail() { return process.env.ETRANSFER_EMAIL ?? ""; },
  get mailFrom() { return process.env.MAIL_FROM ?? ""; },
  get phone() { return "403-656-8200"; },
  get routingUrl() { return (process.env.ROUTING_URL ?? "").trim().replace(/\/+$/, ""); }, // OSRM-compatible; empty = straight-line
  get cronDisabled() { return !!process.env.CRON_DISABLED; },
  get secure() { return (process.env.APP_URL ?? "").startsWith("https://"); },
};
