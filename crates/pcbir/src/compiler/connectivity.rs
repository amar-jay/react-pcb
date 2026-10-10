use std::collections::{BTreeMap, BTreeSet};

use crate::diagnostic::Diagnostic;
use crate::ir::{ComponentDefinition, NetDefinition, NetId, PartInstance, RouteConstraint};

// A pin is local to its owning part. Never use a concatenated display label as identity.
type Endpoint<'a> = (&'a str, &'a str);

fn label((part, pin): &Endpoint<'_>) -> String {
    format!("{part}.{pin}")
}

/// Check declared connectivity intent, not physical copper continuity. Routes and
/// differential-pair legs are edges; unresolved zone fills do not imply edges.
/// Region feasibility is checked independently by constraint_validation. Keep
/// these edges even when a waypoint is blocked: a graph connection records intent
/// and never approves realized traversal (reported separately as PCBIR043).
pub(super) fn validate_connectivity(
    instances: &[PartInstance],
    definitions: &BTreeMap<String, ComponentDefinition>,
    nets: &BTreeMap<NetId, NetDefinition>,
    routes: &[RouteConstraint],
) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    let mut endpoints: BTreeMap<&NetId, BTreeSet<Endpoint<'_>>> =
        nets.keys().map(|id| (id, BTreeSet::new())).collect();
    let mut parts: Vec<_> = instances.iter().collect();
    parts.sort_by(|a, b| a.id.cmp(&b.id));
    for part in parts {
        let pins: BTreeSet<_> = definitions[&part.component]
            .pins
            .keys()
            .chain(part.pin_map.keys())
            .collect();
        let unconnected: Vec<_> = pins
            .into_iter()
            .filter(|pin| !part.connections.contains_key(*pin))
            .map(String::as_str)
            .collect();
        if !unconnected.is_empty() {
            diagnostics.push(
                Diagnostic::warning(
                    "PCBIR032",
                    format!("unconnected pins: {}", unconnected.join(", ")),
                )
                .with_entity(&part.id)
                .with_help("Add the intended nets to the part's connect property. Review unused pins against the component datasheet."),
            );
        }
        for (pin, net) in &part.connections {
            endpoints
                .entry(net)
                .or_default()
                .insert((part.id.as_str(), pin.as_str()));
        }
    }

    let mut adjacency: BTreeMap<Endpoint<'_>, BTreeSet<Endpoint<'_>>> = BTreeMap::new();
    // Called only after endpoint validation: both ends exist and belong to this net.
    for route in routes {
        let from = (route.from.part.as_str(), route.from.name.as_str());
        let to = (route.to.part.as_str(), route.to.name.as_str());
        adjacency.entry(from).or_default().insert(to);
        adjacency.entry(to).or_default().insert(from);
    }

    for (net, mut remaining) in endpoints {
        if remaining.len() < 2 {
            let message = match remaining.first() {
                Some(endpoint) => format!(
                    "net {} has only one connected endpoint: {}",
                    nets[net].name,
                    label(endpoint)
                ),
                None => format!("net {} has no connected endpoints", nets[net].name),
            };
            diagnostics.push(
                Diagnostic::warning("PCBIR033", message)
                    .with_entity(&net.0)
                    .with_help("Connect this net to its intended pins, or remove the unused net reference."),
            );
            continue;
        }

        let mut groups = Vec::new();
        while let Some(start) = remaining.pop_first() {
            let mut group = BTreeSet::from([start]);
            let mut pending = vec![start];
            while let Some(endpoint) = pending.pop() {
                if let Some(neighbors) = adjacency.get(&endpoint) {
                    for neighbor in neighbors {
                        if remaining.remove(neighbor) {
                            group.insert(*neighbor);
                            pending.push(*neighbor);
                        }
                    }
                }
            }
            groups.push(group.iter().map(label).collect::<Vec<_>>().join(", "));
        }
        if groups.len() > 1 {
            diagnostics.push(
                Diagnostic::warning(
                    "PCBIR034",
                    format!(
                        "net {} has {} disconnected endpoint groups in routing intent: [{}]",
                        nets[net].name,
                        groups.len(),
                        groups.join("] | [")
                    ),
                )
                .with_entity(&net.0)
                .with_help("Add Route or DifferentialPair declarations to connect all endpoint groups. Copper zones are unresolved intent and do not establish a connection; physical copper continuity is not checked here."),
            );
        }
    }
    diagnostics
}
