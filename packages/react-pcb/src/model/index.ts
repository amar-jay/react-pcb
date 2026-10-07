export function point(x: number, y: number): Point {
  return Object.freeze({x, y});
}

export function rect(x: number, y: number, width: number, height: number): Rect {
  return Object.freeze({kind: 'rect', x, y, width, height});
}

export function net(name: string, id = name): Net {
  return Object.freeze({kind: 'net', id, name});
}

export function part(reference: string, id = reference): Part {
  return Object.freeze({kind: 'part', id, reference});
}

export function pad(owner: Part, name: string): Pin {
  return Object.freeze({kind: 'pin', part: owner, name});
}
