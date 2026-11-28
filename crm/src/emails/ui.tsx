// Branded email building blocks, ported 1:1 from the Python site's emails.py.
// Email-client-safe: tables + inline styles. JSX escapes every interpolated value, so customer input
// is never raw HTML (the guarantee esc() gave in Python).
import { AsyncLocalStorage } from "node:async_hooks";
import type { CSSProperties, ReactNode } from "react";
import { fill } from "@/server/email/wording";

export const NAVY = "#14213d", BLUE = "#1d6fd8", SKY = "#7cb8ff", INK_SOFT = "#4a5672", LINE = "#dfe5ef", TINT = "#f4f7fc";
export const FONT = "'Rubik','Helvetica Neue',Helvetica,Arial,sans-serif";
export const BODY_FONT = "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif";

/**
 * Per-send settings from Settings › Messages: branding, and the owner's own wording for this template. renderMessage sets
 * them once around the render, so the templates don't each pass them down. With none set (the default) every email is
 * the built-in look and wording.
 */
export type Mail = { color?: string | null; logoUrl?: string | null; business?: string; intro?: string | null; closing?: string | null; vars: Record<string, string> };
export const mailStore = new AsyncLocalStorage<Mail>();
const accent = () => mailStore.getStore()?.color || BLUE;

const mediaCss = (link: string) => `
  body { margin:0; padding:0; }
  a { color:${link}; }
  @media (max-width:620px) {
    .px { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:26px !important; }
    .stack { display:block !important; width:100% !important; }
    .btn-cell { padding:0 0 10px 0 !important; }
    .stack-pad { padding:14px 0 0 0 !important; text-align:left !important; }
  }`;

export function Table({ children, style, width = "100%" }: { children: ReactNode; style?: CSSProperties; width?: string }) {
  return (
    <table role="presentation" width={width} cellPadding={0} cellSpacing={0} border={0} style={style}>
      <tbody>{children}</tbody>
    </table>
  );
}

/** Outer shell: grey canvas, centred 600px card, hidden preheader shown in inbox previews. */
export function EtcEmail({ title, preheader, vars, children }: { title: string; preheader: string; vars?: Record<string, string>; children: ReactNode }) {
  // What this email can put into the owner's {{variables}} (their opening, closing and subject line).
  const mail = mailStore.getStore();
  if (mail && vars) Object.assign(mail.vars, vars);
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>{title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@600;700&family=Inter:wght@400;600&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: mediaCss(accent()) }} />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#eef2f8" }}>
        <div style={{ display: "none", maxHeight: 0, overflow: "hidden", opacity: 0, color: "#eef2f8" }}>
          {preheader}
          {" ‌ ".repeat(4)}
        </div>
        <Table style={{ background: "#eef2f8" }}>
          <tr>
            <td align="center" style={{ padding: "28px 12px" }}>
              <Table style={{ maxWidth: 600, background: "#ffffff", borderRadius: 18, overflow: "hidden", border: `1px solid ${LINE}` }}>
                {children}
              </Table>
            </td>
          </tr>
        </Table>
      </body>
    </html>
  );
}

export function Header({ right }: { right: ReactNode }) {
  const mail = mailStore.getStore();
  // The owner's logo sits on white (most logos are made for a light page), with their colour underneath.
  if (mail?.logoUrl) return (
    <tr>
      <td className="px" style={{ background: "#ffffff", padding: "18px 32px", borderBottom: `3px solid ${accent()}` }}>
        <Table>
          <tr>
            <td><img src={mail.logoUrl} alt={mail.business ?? ""} height={44} style={{ display: "block", height: 44, width: "auto", maxWidth: 260, border: 0 }} /></td>
            <td align="right" style={{ fontFamily: BODY_FONT, fontSize: 13, color: INK_SOFT }}>{right}</td>
          </tr>
        </Table>
      </td>
    </tr>
  );
  return (
    <tr>
      <td className="px" style={{ background: NAVY, padding: "20px 32px" }}>
        <Table>
          <tr>
            <td style={{ fontFamily: FONT, fontSize: 30, fontWeight: 700, letterSpacing: "-0.5px", color: "#ffffff", lineHeight: 1 }}>
              etc<span style={{ color: SKY }}>.</span>
            </td>
            <td align="right" style={{ fontFamily: BODY_FONT, fontSize: 13, color: "#b9c3d8" }}>{right}</td>
          </tr>
        </Table>
      </td>
    </tr>
  );
}

/** Label / value rows for a summary card. */
export function SummaryRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <Table>
      {rows.map(([label, value], i) => {
        const border = i === 0 ? {} : { borderTop: `1px solid ${LINE}` };
        return (
          <tr key={label}>
            <td valign="top" style={{ ...border, padding: "12px 0", width: 120, fontFamily: BODY_FONT, fontSize: 13, color: INK_SOFT }}>{label}</td>
            <td valign="top" style={{ ...border, padding: "12px 0", fontFamily: BODY_FONT, fontSize: 15, color: NAVY, fontWeight: 600 }}>{value}</td>
          </tr>
        );
      })}
    </Table>
  );
}

export function Button({ href, label, bg = accent(), fg = "#ffffff", border }: { href: string; label: string; bg?: string; fg?: string; border?: string }) {
  return (
    <Table width="auto">
      <tr>
        <td {...({ bgcolor: bg } as object)} style={{ borderRadius: 999, border: `2px solid ${border ?? bg}` }}>
          <a href={href} style={{ display: "inline-block", padding: "12px 22px", fontFamily: BODY_FONT, fontSize: 15, fontWeight: 600, color: fg, textDecoration: "none", borderRadius: 999 }}>
            {label}
          </a>
        </td>
      </tr>
    </Table>
  );
}

/** Multi-line text with <br>s (JSX-escaped). */
export function Lines({ text }: { text: string | string[] }) {
  const lines = Array.isArray(text) ? text : text.split("\n");
  return <>{lines.map((l, i) => <span key={i}>{i > 0 && <br />}{l}</span>)}</>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div style={{ fontFamily: BODY_FONT, fontSize: 12, fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase", color: accent() }}>{children}</div>;
}

export function H1({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <h1 className="h1" style={{ margin: "10px 0 12px", fontFamily: FONT, fontSize: 30, lineHeight: 1.15, fontWeight: 700, color: NAVY, ...style }}>{children}</h1>;
}

export function P({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <p style={{ margin: "0 0 22px", fontFamily: BODY_FONT, fontSize: 16, lineHeight: 1.6, color: INK_SOFT, ...style }}>{children}</p>;
}

function Wording({ text, style, children }: { text?: string | null; style?: CSSProperties; children: ReactNode }) {
  if (!text?.trim()) return <>{children}</>;
  // Plain text only: JSX escapes it, a blank line starts a new paragraph, a single line break stays a line break.
  return <>{fill(text, mailStore.getStore()!.vars).trim().split(/\n\s*\n/).map((para, i) => <P key={i} style={style}><Lines text={para} /></P>)}</>;
}
/** The opening paragraph(s) under the heading: the built-in wording (children) unless the owner wrote their own. */
export function Intro({ children }: { children: ReactNode }) {
  return <Wording text={mailStore.getStore()?.intro}>{children}</Wording>;
}
/** The closing note, same rule. `style` is the built-in note's look, kept for the owner's words. */
export function Closing({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <Wording text={mailStore.getStore()?.closing} style={style}>{children}</Wording>;
}

export function Footer({ site, phone, reason }: { site: string; phone: string; reason: string }) {
  const tel = "tel:+1" + phone.replace(/\D/g, "");
  return (
    <tr>
      <td className="px" align="center" style={{ padding: "24px 40px 30px", fontFamily: BODY_FONT, fontSize: 13, lineHeight: 1.7, color: INK_SOFT }}>
        Questions? Call <a href={tel} style={{ color: NAVY, fontWeight: 600, textDecoration: "none" }}>{phone}</a> or just reply to this email.<br />
        <a href={site} style={{ color: accent(), textDecoration: "none", fontWeight: 600 }}>etccrew.ca</a> · Snow shovelling &amp; odd jobs in Calgary<br />
        <span style={{ color: "#9aa5bb", fontSize: 12 }}>{reason}</span>
      </td>
    </tr>
  );
}

export const firstName = (name: string) => (name ?? "").trim().split(" ")[0] || "neighbour";
