# Working with the cluster bibliography

The bibliography is harvested from ERef and EPub Bayreuth and published in
[Omeka item set 29918](https://data.africamultiple.uni-bayreuth.de/s/amira/item-set/29918).
The MCP server reads that set without restricting publication templates, so new
upstream types remain discoverable. It does not harvest the repositories directly.

On **9 September 2026**, the public API contained **562 publications**, including
**60 with extracted full text**, and **87 journal authority records**. These are
dated observations, not fixed limits. Start with `get_collection_overview` to
check the running server's counts and snapshot date.

## Discover and count

`list_publication_facets` counts the complete filtered bibliography. Choose one
`facet`: `type`, `year`, `language`, `subject`, `author`, or `venue`.

```json
{"facet":"type","language":"fr"}
```

The response reports `total_publications`, `missing_values`, and a paginated
`results` array with `value` and `publication_count`. Linked values also carry
an `amira_url`. `total_matches` means **distinct facet values**, not publications.
An author/editor credited twice in one publication counts once. A publication
with several subjects counts once under each, so multi-valued facet counts
need not sum to the total. Values are grouped by accent-insensitive label;
these are discovery counts, not a disambiguated bibliometric author network.

Use `limit` (default 25, maximum 100) and `next_offset` to page values. Missing
metadata is counted separately; it is never silently labelled as another type
or language. Year values feed `year_from` and `year_to`, set to the same year.

## Retrieve the matching records

Both `search_publications` and `list_publication_facets` accept the same filters:

| Filter | Matching |
| --- | --- |
| `keyword` | Substring in title, abstract, venue, subjects, or available full text |
| `author` | Authors and editors; either name order |
| `subject` | Partial subject heading |
| `language` | Name or ISO code, including `fr`, `fra`, `fre` |
| `type` | Exact type from the type facet |
| `venue` | Partial journal/book title |
| `has_fulltext` | Whether extracted text exists; `false` is also supported |
| `year_from`, `year_to` | Inclusive publication-year range |

Filters are AND-combined and text comparisons ignore case and accents. An
inverted year range returns `invalid_range`. Publication search is newest first;
it defaults to 25 records and caps at 100 per call.

```json
{"language":"French","subject":"Islam","year_from":2019,"limit":10}
```

For multi-word keyword queries, `search_publications` matches a phrase as a
substring. The HTTP `search` adapter ranks individual terms across multiple
corpora; its matching semantics differ.

## Read and cite

Pass the returned Omeka `id` to `get_publication`. Every retained ERef/EPub
identifier also resolves to the record, including secondary identities from
deduplication. For example, the aliases `eref-95983` and `epub-9405` resolve to
[the same AMIRA record](https://data.africamultiple.uni-bayreuth.de/s/amira/item/29919)
in the September snapshot. These aliases are lookup keys; cite the public page.

Detail includes `identifiers`, `series` (separate from the containing `venue`),
repository URLs, authors/editors, and generated `bibtex`. Corporate names are
brace-protected. Unsupported BibTeX categories retain their original type in a
neutral `misc` entry instead of claiming a different qualification or medium.
The bibliography export links to the DOI/repository; in a research answer,
cite `amira_url` and add the DOI as a supplementary link when useful.

Full text is opt-in and paginated:

```json
{"id":"29919","include_fulltext":true,"fulltext_offset":0,"fulltext_max_chars":5000}
```

The next offset is `fulltext_offset + fulltext_returned_chars`. Continue only
while `fulltext_truncated` is true. A missing full text means this snapshot has
no extracted text; it does **not** establish that the publication is closed
access. Never infer cluster output from this curated bibliography alone.

The experimental metadata-exposure modes apply to filters, facets, and BibTeX
as well as JSON. Facets require `structured`; full-text search/read requires
`full`. Publication RIS/CSL-JSON export is not implemented yet; those formats
are currently available for research items only.

## Maintaining coverage

`npm run fetch-data` rebuilds the local snapshot. Existing schema-v4 snapshots
remain readable: `identifiers` and `series` are optional additions, with legacy
fallbacks. Rebuild the snapshot to populate them; an unchanged older snapshot
will not acquire new fields merely by restarting the server.

The public data audit found further useful fields (`bibo:presentedAt`,
`fabio:hasURL`, `bibo:numPages`, rights, thesis advisers) that are not yet exposed.
Priorities and constraints are recorded in the [roadmap](../ROADMAP.md).
