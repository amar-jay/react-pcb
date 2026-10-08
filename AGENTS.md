# PCB IR architecture

PCB IR is a normalized, serializable representation of PCB design intent,
connectivity, manufacturing-relevant component identity, constraints, and physical
realization. It is independent of source syntax, EDA software, routing
implementation, and fabrication output format.

## Stable identity

**Everything that can be referenced has a stable ID.**

- The compiler gives every referenceable IR entity an explicit ID or definition
  key. JSX and other source frontends do not need to specify IR IDs. Frontends
  may supply identity hints (such as ordinary React keys) to distinguish repeated
  anonymous declarations; these hints are not canonical IR entities.
  Referenceable entities include components, footprints, placed parts, pins, pads, nets, layers, constraints, and
  referenceable physical geometry.
- References use IDs, not display names, object identity, duplicated entity
  properties, or array positions. Stackup order describes physical ordering; it
  does not define layer identity.
- IDs are unique within a documented namespace. Local IDs, such as a pad ID,
  are resolved together with their owning entity's ID.
- Preserve IDs across serialization and unrelated edits. Do not regenerate or
  renumber existing IDs when entities are reordered or other entities are added.
- Validate uniqueness, reference existence, and target type. Reject conflicting
  definitions that claim the same key.
- Keep IDs separate from descriptive names and attributes. IDs such as
  `copper/1` identify a layer; its kind, usage, side, and stackup position carry
  its physical meaning.

## Normalization and boundaries

- Keep reusable electrical component definitions, physical footprint definitions,
  and placed parts separate: `componentDefinitions`, `footprintDefinitions`,
  and `parts`.
- A placed part references its component and footprint definitions and owns its
  placement, connectivity, and logical-pin-to-physical-pad binding.
- Represent design intent and constraints independently of resolved geometry.
  Preserve the information needed by future validators, routers, simulators,
  exporters, and manufacturing backends.
- Make unresolved references or geometry explicit and diagnostic; do not invent
  physical data or silently discard supported design intent.
- Keep source-specific constructs and tool-specific behavior at the frontend or
  backend boundary. The canonical IR must not depend on React, JSX, KiCad,
  a particular router, Gerber, or a particular manufacturer.

## Current documentation with Context7

Use the `ctx7` CLI to fetch current documentation whenever the task asks about a
library, framework, SDK, API, CLI tool, or cloud service. This includes API syntax,
configuration, version migration, library-specific debugging, setup instructions,
and CLI usage, even for familiar technologies. Prefer Context7 over web search
for library documentation.

Do not use it for refactoring, writing scripts from scratch, debugging business
logic, code review, or general programming concepts.

1. Resolve the library with
   `npx ctx7@latest library <name> "<user's question>"`. Use the official library
   name and the full question, focused on one concept unless the question concerns
   how concepts interact.
2. Choose the best `/org/project` match using exact name, description relevance,
   snippet count, source reputation, and benchmark score. Try an alternate name
   or query if the results are unsuitable.
3. Fetch documentation with
   `npx ctx7@latest docs <libraryId> "<user's question>"`. Use separate docs
   commands for distinct concepts, within a maximum of three commands per question.
4. Base the answer on the fetched documentation.

Call `library` first unless the user supplies a `/org/project` ID. For
version-specific questions, use the versioned ID returned by `library`.
Never include credentials or other sensitive information in queries.

Run Context7 CLI requests outside the default sandbox. If a request encounters
DNS or network errors, rerun outside the sandbox rather than retrying inside it.
If a command fails with a quota error, inform the user and suggest
`npx ctx7@latest login` or setting `CONTEXT7_API_KEY` for higher limits. Do not
silently fall back to training data.
