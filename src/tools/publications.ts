// The cluster bibliography (ERef/EPub harvest) + the Journal venue authority.
// Open-access publications carry extracted PDF full text (bibo:content):
// searchable here (with a match snippet), never included in summaries, and
// opt-in + windowable in get_publication — the same discipline as transcripts.
import { z } from "zod";
import { ensureStore } from "../data.js";
import type { LinkedRef } from "../types.js";
import { allowDescriptive, allowFullText, allowStructured } from "../exposure.js";
import {
  annotate,
  capLimit,
  capOffset,
  capText,
  containsCI,
  errorResult,
  exposureRestrictedResult,
  filtersEcho,
  limitEcho,
  matchSnippet,
  pageOf,
  publicationSummary,
  refLabels,
  textAccessDisabledResult,
  textResult,
  textWindowFields,
  type Server,
} from "./_shared.js";
import { itemUrl, itemUrlOrNull } from "../urls.js";
import { publicationBibtex } from "../publicationCitation.js";
import { publicationFilters, publicationFilterError, selectPublications } from "../publicationQuery.js";
import { fold } from "../text.js";

export function registerPublicationTools(server: Server): void {
  // === search_publications ==================================================
  server.registerTool(
    "search_publications",
    {
      title: "Search publications",
      description:
        "Search the ERef/EPub cluster bibliography. Filters are AND-combined; newest first. " +
        "Keyword reaches extracted PDF text, with matched_in='fulltext' and a snippet for text-only hits. " +
        "Use list_publication_facets for types, years, languages, subjects, contributors and venues; " +
        "get_publication for detail and BibTeX. Cite amira_url; DOI/repository url is an additional link.",
      annotations: annotate("Search publications"),
      inputSchema: z.strictObject({
        ...publicationFilters,
        limit: z.number().int().min(1).optional().describe("Default 25, max 100"),
        offset: z.number().int().min(0).max(100_000).optional(),
      }),
    },
    async (args) => {
      const store = await ensureStore();
      const limit = capLimit(args.limit, 25, 100);
      const offset = capOffset(args.offset);
      const invalid = publicationFilterError(args);
      if (invalid) return invalid;
      const { records: filtered, fulltextOnly } = selectPublications(store, args);

      filtered.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title));

      return textResult(
        pageOf(
          filtered,
          offset,
          limit,
          (p) =>
            fulltextOnly.has(p.o_id)
              ? { ...publicationSummary(p), matched_in: "fulltext", fulltext_snippet: matchSnippet(p.fulltext, args.keyword!) }
              : publicationSummary(p),
          { ...limitEcho(args.limit, 100, limit), ...filtersEcho(args) },
        ),
      );
    },
  );

  // === get_publication ======================================================
  server.registerTool(
    "get_publication",
    {
      title: "Get publication detail",
      description:
        "Full metadata for one publication: authors, editors, venue (with the journal's own `amira_url` " +
        "and ISSN when it is a Journal authority record), volume/issue/pages, publisher, DOI, ISBN/ISSN, " +
        "peer-review status, funders, places of publication, abstract, subjects, language, ERef/EPub " +
        "links, and BibTeX generated from the structured fields. The extracted FULL TEXT is OMITTED by " +
        "default (only has_fulltext + fulltext_length are shown) — pass include_fulltext=true and page a " +
        "long one. Cite `amira_url`; DOI/repository `url` is an additional link. Returns " +
        "{ error } if the id is unknown.",
      annotations: annotate("Get publication detail"),
      inputSchema: z.strictObject({
        id: z.union([z.string(), z.number()]).describe("Publication Omeka o:id (legacy publication keys also work)"),
        include_fulltext: z.boolean().optional().describe("Default false — set true to include the extracted full text"),
        fulltext_offset: z.number().int().min(0).optional().describe("Start offset into the full text (chars), with include_fulltext"),
        fulltext_max_chars: z.number().int().min(1).optional().describe("Max full-text characters to return (default/max 25000)"),
      }),
    },
    async ({ id, include_fulltext, fulltext_offset, fulltext_max_chars }) => {
      const store = await ensureStore();
      const p = store.getPublication(String(id));
      if (!p) {
        return errorResult("not_found", `No publication with id '${id}'.`, { suggested_tool: "search_publications" });
      }
      if (include_fulltext && !allowFullText()) return textAccessDisabledResult("fulltext");
      const journal = p.venue_ref?.o_id != null ? store.getJournal(p.venue_ref.o_id) : undefined;

      return textResult({
        id: String(p.o_id),
        omeka_id: p.o_id,
        title: p.title,
        type: p.type,
        year: p.year,
        date: p.date,
        ...(allowStructured()
          ? {
              authors: refLabels(p.authors),
              editors: refLabels(p.editors),
              venue: p.venue,
              ...(p.venue_ref?.o_id != null
                ? {
                    venue_omeka_id: p.venue_ref.o_id,
                    venue_amira_url: itemUrl(p.venue_ref.o_id),
                    ...(journal?.issn ? { venue_issn: journal.issn } : {}),
                  }
                : {}),
              subjects: refLabels(p.subjects),
              funders: refLabels(p.funders),
              places_of_publication: refLabels(p.places_of_publication),
              relations: p.relations,
              series: p.series ?? [],
            }
          : {}),
        volume: p.volume,
        issue: p.issue,
        pages: p.pages,
        publisher: p.publisher,
        doi: p.doi,
        isbn: p.isbn,
        issn: p.issn,
        status: p.status,
        language: p.language,
        abstract: allowDescriptive() && p.abstract ? capText(p.abstract).text : null,
        url: p.doi ?? p.urls[0] ?? null,
        repository_urls: p.urls,
        identifiers: p.identifiers ?? [p.pub_id],
        has_media: p.has_media,
        thumbnail: p.thumbnail,
        ...textWindowFields("fulltext", p.fulltext, {
          include: include_fulltext,
          offset: fulltext_offset,
          maxChars: fulltext_max_chars,
        }),
        bibtex: publicationBibtex(p),
        amira_url: itemUrl(p.o_id),
      });
    },
  );

  // === list_publication_facets ==============================================
  server.registerTool(
    "list_publication_facets",
    {
      title: "Publication facets",
      description:
        "Count publications by type, year, language, subject, author/editor or venue across the complete " +
        "filtered bibliography. Each publication counts once per value; missing_values counts records " +
        "without this facet. Ranked by count, paginated. Use values in search_publications filters.",
      annotations: annotate("Publication facets"),
      inputSchema: z.strictObject({
        facet: z.enum(["type", "year", "language", "subject", "author", "venue"]),
        ...publicationFilters,
        limit: z.number().int().min(1).optional().describe("Default 25, max 100"),
        offset: z.number().int().min(0).max(100_000).optional(),
      }),
      outputSchema: z.object({
        facet: z.string(),
        total_publications: z.number(),
        missing_values: z.number(),
        count: z.number(),
        total_matches: z.number(),
        offset: z.number(),
        has_more: z.boolean(),
        next_offset: z.number().optional(),
        filters: z.record(z.string(), z.unknown()).optional(),
        requested_limit: z.number().optional(),
        effective_limit: z.number().optional(),
        results: z.array(z.object({
          value: z.string(),
          publication_count: z.number(),
          amira_url: z.string().optional(),
        })),
      }),
    },
    async ({ facet, ...args }) => {
      if (!allowStructured()) return exposureRestrictedResult("structured", "list_publication_facets");
      const invalid = publicationFilterError(args);
      if (invalid) return invalid;
      const store = await ensureStore();
      const { records } = selectPublications(store, args);
      const buckets = new Map<string, { value: string; publication_count: number; amira_url?: string }>();
      let missing = 0;
      for (const p of records) {
        const literal = (value: string | null): LinkedRef[] => value ? [{ label: value, o_id: null }] : [];
        const refs = facet === "author" ? [...p.authors, ...p.editors]
          : facet === "subject" ? p.subjects
          : facet === "venue" ? p.venue_ref ? [p.venue_ref] : literal(p.venue)
          : facet === "year" ? literal(p.year == null ? null : String(p.year))
          : literal(p[facet]);
        const seen = new Set<string>();
        for (const ref of refs) {
          const key = fold(ref.label.trim());
          if (!key || seen.has(key)) continue;
          seen.add(key);
          const bucket = buckets.get(key) ?? { value: ref.label, publication_count: 0 };
          bucket.publication_count++;
          if (ref.o_id != null) bucket.amira_url ??= itemUrl(ref.o_id);
          buckets.set(key, bucket);
        }
        if (!seen.size) missing++;
      }
      const ranked = [...buckets.values()].sort((a, b) => b.publication_count - a.publication_count || a.value.localeCompare(b.value));
      const limit = capLimit(args.limit, 25, 100);
      return textResult(pageOf(ranked, capOffset(args.offset), limit, (r) => r, {
        facet, total_publications: records.length, missing_values: missing,
        ...limitEcho(args.limit, 100, limit), ...filtersEcho(args),
      }));
    },
  );

  // === list_journals ========================================================
  server.registerTool(
    "list_journals",
    {
      title: "List journals",
      description:
        "List the journals the cluster publishes in (the Journal venue authority), ranked by how many " +
        "publications appeared in each, with ISSN, country of publication and website. Feed a title into " +
        "the `venue` filter of search_publications to retrieve its articles.",
      annotations: annotate("List journals"),
      inputSchema: z.strictObject({
        keyword: z.string().optional().describe("Substring filter on the journal title"),
        limit: z.number().int().min(1).optional().describe("Default 50, max 200"),
        offset: z.number().int().min(0).max(100_000).optional(),
      }),
    },
    async (args) => {
      const store = await ensureStore();
      if (!allowStructured()) return exposureRestrictedResult("structured", "list_journals");
      const limit = capLimit(args.limit, 50, 200);
      const offset = capOffset(args.offset);

      const pubCounts = new Map<number, number>();
      for (const p of store.publications) {
        if (p.venue_ref?.o_id != null) pubCounts.set(p.venue_ref.o_id, (pubCounts.get(p.venue_ref.o_id) ?? 0) + 1);
      }

      let ranked = store.journals
        .map((j) => ({ j, count: pubCounts.get(j.o_id) ?? 0 }))
        .sort((a, b) => b.count - a.count || a.j.title.localeCompare(b.j.title));
      if (args.keyword) ranked = ranked.filter((r) => containsCI(r.j.title, args.keyword!));

      return textResult(
        pageOf(
          ranked,
          offset,
          limit,
          (r) => ({
            journal: r.j.title,
            id: String(r.j.o_id),
            omeka_id: r.j.o_id,
            issn: r.j.issn,
            country: r.j.country?.label ?? null,
            country_amira_url: itemUrlOrNull(r.j.country?.o_id),
            publication_count: r.count,
            website: r.j.url,
            amira_url: itemUrl(r.j.o_id),
          }),
          { distinct_journals: ranked.length, ...limitEcho(args.limit, 200, limit), ...filtersEcho(args) },
        ),
      );
    },
  );
}
