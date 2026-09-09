import test from "node:test";
import assert from "node:assert/strict";
import { DataStore, publicationBibtex, transformPublication, SNAPSHOT_SCHEMA_VERSION } from "../../server/lib.js";
import { buildFixture } from "../fixtures/fixture-data.mjs";

test("publication aliases and series survive transform and resolve to the same record", () => {
  const literal = (value) => ({ type: "literal", "@value": value });
  const p = transformPublication({
    "o:id": 42, "o:title": "A publication",
    "dcterms:identifier": [literal("eref-42"), literal("epub-123")],
    "dre:series": [literal("Africa Multiple Studies")],
  }, { roleLabel: () => null, classTerm: () => "fabio:Book" }, 1);
  assert.deepEqual(p.identifiers, ["eref-42", "epub-123"]);
  assert.deepEqual(p.series, ["Africa Multiple Studies"]);
  const fixture = buildFixture(SNAPSHOT_SCHEMA_VERSION);
  fixture.data.publications = [p];
  const store = new DataStore("bundled", fixture.data, fixture.manifest);
  assert.equal(store.getPublication("epub-123"), store.getPublication("42"));
  assert.equal(store.getPublication("EREF-42"), p);
  assert.match(publicationBibtex(p), /series = \{Africa Multiple Studies\}/);
});

test("publication BibTeX preserves corporate authors and avoids false thesis types", () => {
  const p = buildFixture(SNAPSHOT_SCHEMA_VERSION).data.publications[0];
  p.authors = [{ label: "Institute of African and Diaspora Studies", o_id: null }];
  assert.match(publicationBibtex(p), /author = \{\{Institute of African and Diaspora Studies\}\}/);
  for (const type of ["bachelors_thesis", "habilitation", "translation"]) {
    const bib = publicationBibtex({ ...p, type });
    assert.match(bib, /^@misc\{/);
    assert.ok(bib.includes(`type = {${type}}`));
  }
});

test("existing v4 snapshots without optional publication fields remain usable", () => {
  const fixture = buildFixture(SNAPSHOT_SCHEMA_VERSION);
  const store = new DataStore("bundled", fixture.data, fixture.manifest);
  assert.equal(store.getPublication("eref-510").o_id, 510);
  assert.match(publicationBibtex(store.getPublication("510")), /^@article/);
});
