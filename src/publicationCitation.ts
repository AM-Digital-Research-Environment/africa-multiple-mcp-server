// Publication exports share name escaping with archival citations. Structured
// names and venues respect the same exposure policy as the detail JSON.
import type { PublicationRec } from "./types.js";
import { allowStructured } from "./exposure.js";
import { bibtexName } from "./citation.js";

const BIBTEX_ENTRY: Record<string, string> = {
  article: "article",
  book: "book",
  chapter: "incollection",
  conference: "inproceedings",
  doctoral_thesis: "phdthesis",
  working_paper: "techreport",
  journal_issue: "misc",
  book_review: "article",
  online_post: "misc",
  research_data: "misc",
  // Templates 24-32, added upstream 2026-09. BibTeX has no entry for a
  // habilitation, a series editorship or a translation, so they take the
  // nearest honest one rather than a wrong-but-specific one.
  preprint: "misc",
  newspaper_article: "article",
  legal_commentary: "incollection",
  encyclopedia_entry: "incollection",
  translation: "misc",
  series_editorship: "misc",
  habilitation: "misc",
  masters_thesis: "mastersthesis",
  bachelors_thesis: "misc",
};

/** Types whose venue is a periodical (BibTeX `journal`) rather than a book. */
const VENUE_IS_JOURNAL = new Set(["article", "book_review", "newspaper_article"]);
/** Types whose venue is the containing volume (BibTeX `booktitle`). */
const VENUE_IS_BOOKTITLE = new Set([
  "chapter",
  "conference",
  "legal_commentary",
  "encyclopedia_entry",
]);

/** Minimal BibTeX from the structured fields (Omeka carries no raw BibTeX). */
export function publicationBibtex(p: PublicationRec): string {
  const entry = BIBTEX_ENTRY[p.type] ?? "misc";
  const esc = (s: string) => s.replace(/[{}]/g, "");
  const lines: string[] = [];
  const add = (k: string, v: string | null | undefined) => {
    if (v) lines.push(`  ${k} = {${esc(v)}}`);
  };
  if (allowStructured()) {
    for (const [role, refs] of [["author", p.authors], ["editor", p.editors]] as const) {
      if (refs.length) lines.push(`  ${role} = {${refs.map((r) => bibtexName(r.label)).join(" and ")}}`);
    }
  }
  add("title", p.title);
  if (allowStructured()) {
    if (VENUE_IS_JOURNAL.has(p.type)) add("journal", p.venue);
    else if (VENUE_IS_BOOKTITLE.has(p.type)) add("booktitle", p.venue);
    add("series", p.series?.length ? p.series.join("; ") :
      !VENUE_IS_JOURNAL.has(p.type) && !VENUE_IS_BOOKTITLE.has(p.type) ? p.venue : null);
  }
  add("year", p.year != null ? String(p.year) : null);
  add("volume", p.volume);
  add("number", p.issue);
  add("pages", p.pages);
  add("publisher", p.publisher);
  add("doi", p.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""));
  add("isbn", p.isbn);
  add("issn", p.issn);
  add("url", p.doi ?? p.urls[0]);
  if (["habilitation", "bachelors_thesis", "translation"].includes(p.type)) add("type", p.type);
  return `@${entry}{${p.pub_id},\n${lines.join(",\n")}\n}`;
}
