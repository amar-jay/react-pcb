# TODO

- [x] Develop a declarative PCB footprint authoring system that enables us to generate precise, manufacturing-ready footprints through familiar inline CSS layout abstractions. The system should explore a restricted subset of CSS, including Grid, Flexbox, positioning, and physical units that best fits our use case. Footprints must compile into our IR containing exact physical geometry in SVG. The primary objective is to leverage AI and engineers' proficiency in web development to simplify footprint generation without compromising geometric precision, determinism, or manufacturability.

Completed within the scope and architecture of [PLAN.md](PLAN.md); see the
[completion audit](docs/plan-completion.md). Exact typed physical primitives are
canonical IR, and SVG is their deterministic projection. Manufacturing profiles
check selected process limits and explicitly report unavailable checks;
manufacturing readiness still requires verified land-pattern data and the
applicable process. Full manufacturing export and comprehensive fabrication
approval remain deferred as specified in the plan.
