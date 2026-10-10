//! Exact quarter-turn rounded-box geometry in doubled nanometres.
//! All supported filled primitives are rectangles Minkowski-summed with a disk.
use crate::ir::regions::CheckedRect;
use crate::physical::{Feature, Shape};

/// Prove that open rectangle interiors cover every point of a closed waypoint.
/// Keepout boundaries are allowed, so closed-area union or area totals would
/// wrongly reject shared edges, seams, isolated points and zero-width exits.
/// Check each x event and each open slab between events: the active rectangles
/// are constant there. Their open y intervals must cover both target endpoints
/// with strictly overlapping intervals. All coordinates and midpoints are exact.
pub(crate) fn interiors_cover(target: CheckedRect, rectangles: &[CheckedRect]) -> bool {
    let mut xs = vec![target.min2[0], target.max2[0]];
    for rect in rectangles {
        xs.extend(
            [rect.min2[0], rect.max2[0]]
                .into_iter()
                .filter(|x| target.min2[0] < *x && *x < target.max2[0]),
        );
    }
    xs.sort_unstable();
    xs.dedup();
    // One further doubling keeps slab midpoints exact even for odd edges.
    let samples = xs
        .iter()
        .map(|x| x * 2)
        .chain(xs.windows(2).map(|edges| edges[0] + edges[1]));
    for x in samples {
        let mut intervals: Vec<_> = rectangles
            .iter()
            .filter(|rect| rect.min2[0] * 2 < x && x < rect.max2[0] * 2)
            .map(|rect| (rect.min2[1], rect.max2[1]))
            .filter(|(_, max)| *max > target.min2[1])
            .collect();
        intervals.sort_unstable();
        let mut end = target.min2[1];
        for (min, max) in intervals {
            if min >= end {
                break;
            }
            end = end.max(max);
            if end > target.max2[1] {
                break;
            }
        }
        if end <= target.max2[1] {
            return false;
        }
    }
    true
}

#[derive(Clone, Copy)]
pub(crate) struct Solid {
    center: [i128; 2],
    core: [i128; 2],
    radius: i128,
}
impl Solid {
    /// A checked rectangle, including odd-nm sizes and clipped board intersections.
    pub(crate) fn rectangle(rect: crate::ir::regions::CheckedRect) -> Self {
        Self {
            center: [0, 1].map(|axis| (rect.min2[axis] + rect.max2[axis]) / 2),
            core: [0, 1].map(|axis| (rect.max2[axis] - rect.min2[axis]) / 2),
            radius: 0,
        }
    }

    pub(crate) fn feature(feature: &Feature) -> Self {
        let mut size = feature.shape.size().map(i128::from);
        let radius = match feature.shape {
            Shape::Rect { .. } => 0,
            Shape::RoundedRect { radius, .. } => i128::from(radius) * 2,
            Shape::Circle { diameter } => i128::from(diameter),
            Shape::Oval { .. } => size[0].min(size[1]),
        };
        if feature.rotation % 180 == 90 {
            size.swap(0, 1);
        }
        Self {
            center: feature.at.map(|n| i128::from(n) * 2),
            core: size.map(|n| n - radius),
            radius,
        }
    }
    pub(crate) fn drill(feature: &Feature) -> Self {
        let drill = feature.drill.as_ref().expect("caller selects a drill");
        let mut size = drill.slot.unwrap_or([drill.diameter; 2]).map(i128::from);
        if feature.rotation % 180 == 90 {
            size.swap(0, 1);
        }
        let radius = i128::from(drill.diameter);
        Self {
            center: feature.at.map(|n| i128::from(n) * 2),
            core: size.map(|n| n - radius),
            radius,
        }
    }
    /// Exact containment, including an outward Euclidean margin on the inner solid.
    /// Maximize the difference of support functions in each quadrant. If the
    /// radius difference is negative, axis endpoints give the limiting support.
    pub(crate) fn contains(self, inner: Self, margin: i64) -> bool {
        self.contains2(inner, i128::from(margin) * 2)
    }
    pub(crate) fn contains2(self, inner: Self, margin2: i128) -> bool {
        let delta = [0, 1].map(|axis| {
            (self.center[axis] - inner.center[axis]).abs() + inner.core[axis] - self.core[axis]
        });
        let radius = self.radius - inner.radius - margin2;
        if radius < 0 {
            delta.iter().all(|n| *n <= radius)
        } else {
            delta.map(|n| n.max(0)).iter().map(|n| n * n).sum::<i128>() <= radius * radius
        }
    }
    /// Touching at zero clearance is permitted; actual interior overlap is not.
    pub(crate) fn separated(self, other: Self, clearance: i64) -> bool {
        let delta = [0, 1].map(|axis| {
            (self.center[axis] - other.center[axis]).abs() - self.core[axis] - other.core[axis]
        });
        let radius = self.radius + other.radius + i128::from(clearance) * 2;
        if radius == 0 {
            return delta.iter().any(|n| *n >= 0);
        }
        delta.map(|n| n.max(0)).iter().map(|n| n * n).sum::<i128>() >= radius * radius
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::physical::{Purpose, Role};
    #[test]
    fn open_union_keeps_isolated_boundary_points_even_at_large_coordinates() {
        for offset in [0, -18_014_398_509_481_900_i128, 18_014_398_509_481_900] {
            let rect = |min: [i128; 2], max: [i128; 2]| CheckedRect {
                min2: min.map(|n| n + offset),
                max2: max.map(|n| n + offset),
            };
            let target = rect([4, 4], [8, 8]);
            let mut surrounding = vec![
                rect([2, 2], [6, 10]),
                rect([6, 2], [10, 10]),
                rect([2, 2], [10, 6]),
                rect([2, 6], [10, 10]),
            ];
            // Every point except the shared center (6,6) is prohibited. Area
            // totals, bounding boxes and rasterization would lose that candidate.
            assert!(!interiors_cover(target, &surrounding));
            surrounding.reverse();
            assert!(!interiors_cover(target, &surrounding));
            surrounding.push(target);
            assert!(interiors_cover(target, &surrounding));
        }
    }

    fn feature(shape: Shape, at: [i64; 2], rotation: u16) -> Feature {
        Feature {
            id: "geometry".into(),
            purpose: Purpose::Copper,
            at,
            shape,
            rotation,
            layers: vec![Role::FrontCopper],
            drill: None,
            stroke: None,
        }
    }
    #[test]
    fn squared_spacing_is_exact_for_rectangles_circles_and_capsules() {
        let rectangle = Solid::feature(&feature(Shape::Rect { size: [2, 2] }, [0, 0], 0));
        let diagonal = Solid::feature(&feature(Shape::Rect { size: [2, 2] }, [5, 6], 0));
        assert!(rectangle.separated(diagonal, 5)); // 3-4-5 triangle between corners
        assert!(!rectangle.separated(diagonal, 6));
        let circle = Solid::feature(&feature(Shape::Circle { diameter: 2 }, [0, 0], 0));
        let diagonal = Solid::feature(&feature(Shape::Circle { diameter: 2 }, [3, 4], 0));
        assert!(circle.separated(diagonal, 3));
        assert!(!circle.separated(diagonal, 4));
        let oval = Solid::feature(&feature(Shape::Oval { size: [6, 2] }, [0, 0], 90));
        let circle = Solid::feature(&feature(Shape::Circle { diameter: 2 }, [3, 6], 0));
        assert!(oval.separated(circle, 3)); // core gap (3,4), radii sum 2
        assert!(!oval.separated(circle, 4));
        assert!(!rectangle.separated(rectangle, 0));
        let touching = Solid::feature(&feature(Shape::Rect { size: [2, 2] }, [2, 0], 0));
        assert!(rectangle.separated(touching, 0));
        assert!(!rectangle.separated(touching, 1));
    }
    #[test]
    fn containment_checks_curved_corners_and_both_radius_orderings() {
        let outer = Solid::feature(&feature(Shape::Circle { diameter: 10 }, [0, 0], 0));
        let rectangle = Solid::feature(&feature(Shape::Rect { size: [8, 8] }, [0, 0], 0));
        assert!(!outer.contains(rectangle, 0)); // corners outside, despite fitting envelope
        let rectangle = Solid::feature(&feature(Shape::Rect { size: [6, 8] }, [0, 0], 0));
        assert!(outer.contains(rectangle, 0)); // radius 5 exactly
        assert!(!outer.contains(rectangle, 1));
        let outer = Solid::feature(&feature(Shape::Rect { size: [10, 10] }, [0, 0], 0));
        let circle = Solid::feature(&feature(Shape::Circle { diameter: 8 }, [0, 0], 0));
        assert!(outer.contains(circle, 1));
        assert!(!outer.contains(circle, 2));
        let rounded = Solid::feature(&feature(
            Shape::RoundedRect {
                size: [10, 10],
                radius: 2,
            },
            [0, 0],
            0,
        ));
        assert!(rounded.contains(circle, 1));
        assert!(!rounded.contains(circle, 2));
    }
    #[test]
    fn odd_lengths_and_very_large_geometry_do_not_round_or_overflow() {
        let circle = Solid::feature(&feature(Shape::Circle { diameter: 3 }, [0, 0], 0));
        let other = Solid::feature(&feature(Shape::Circle { diameter: 3 }, [4, 0], 0));
        assert!(circle.separated(other, 1));
        assert!(!circle.separated(other, 2));
        let large = Solid::feature(&feature(
            Shape::Rect { size: [1, 1] },
            [4_000_000_000_000_000, 0],
            0,
        ));
        let distant = Solid::feature(&feature(
            Shape::Rect { size: [1, 1] },
            [-4_000_000_000_000_000, 0],
            0,
        ));
        assert!(large.separated(distant, 7_999_999_999_999_999));
        assert!(!large.separated(distant, 8_000_000_000_000_000));
    }
}
