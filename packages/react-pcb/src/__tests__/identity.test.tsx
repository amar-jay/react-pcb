import {expect, test} from 'bun:test';
import React from 'react';
import {Board, DifferentialPair, Keepout, Part, Route, RouteThrough, Zone, compile, net, pad, part, rect, PcbCompileError} from '../index.ts';
import {testLayers} from './fixtures.ts';

const positive = net('P');
const negative = net('N');
const first = part('U1');
const second = part('U2');
const options = {cwd: import.meta.dir + '/../../../..', hideWarnings: true, baseRevision: 10};

function design(reverse: boolean, width: number) {
  const corridors = [
    <RouteThrough key="entry" region={rect(1, 1, width, 2)} />,
    <RouteThrough key="exit" region={rect(5, 1, 2, 2)} />,
  ];
  const declarations = [
    <Part key="first" id={first} footprint="TEST" connect={{P: positive, N: negative}} />,
    <Part key="second" id={second} footprint="TEST" connect={{P: positive, N: negative}} />,
    <Route key="supply-route" net={positive} from={pad(first, 'P')} to={pad(second, 'P')} width={width}>
      {reverse ? [...corridors].reverse() : corridors}
    </Route>,
    <DifferentialPair key="data-pair" positive={positive} negative={negative}
      from={[pad(first, 'P'), pad(first, 'N')]} to={[pad(second, 'P'), pad(second, 'N')]} />,
    <Zone key="plane" net={negative} layers={[testLayers.stackup.entries[0] as import('../layers/index.ts').CopperLayer]}
      boundary="board" clearance={width} />,
    <Keepout key="edge-clearance" region={rect(1, 1, width, 2)} disallow={['vias']} />,
  ];
  return <Board outline={rect(0, 0, 20, 20)} layers={testLayers}>
    {reverse ? declarations.reverse() : declarations}
  </Board>;
}

test('JSX without constraint IDs compiles to stable IR identities and normalized references', async () => {
  const firstResult = await compile(design(false, 2), options);
  const secondResult = await compile(design(true, 3), options);
  const before = firstResult.ir;
  const after = secondResult.ir;
  expect(after.schemaVersion).toBe(2);
  expect(after.revision).toBe(11);
  expect(after.board).toEqual(before.board);
  expect(after.routeConstraints[0]?.id).toBe(before.routeConstraints[0]?.id);
  expect(after.routeConstraints[0]?.through).toEqual([...before.routeConstraints[0]!.through].reverse());
  expect(after.differentialPairs[0]?.id).toBe(before.differentialPairs[0]?.id);
  expect(after.zones[0]?.id).toBe(before.zones[0]?.id);
  expect(after.keepouts[0]?.id).toBe(before.keepouts[0]?.id);
  expect(after.zones[0]?.layers).toEqual(['copper/1']);
  expect(after.zones[0]?.boundary).toBe(after.board.outline);
  expect(after.regions[after.keepouts[0]!.region]?.geometry.width).toBe(3);
  for (const [id, region] of Object.entries(after.regions)) expect(region.id).toBe(id);
  expect(JSON.stringify(after)).not.toContain('sourceKey');
  expect(secondResult.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['PCBIR024']);
});

test('invalid references fail through the TypeScript compiler bridge', async () => {
  try {
    await compile(<Board outline={rect(0, 0, 20, 20)} layers={testLayers}>
      <Route net={positive} from={pad(first, 'P')} to={pad(second, 'P')} />
    </Board>, options);
    throw new Error('expected compilation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(PcbCompileError);
    expect((error as PcbCompileError).diagnostic.code).toBe('PCBIR002');
  }
});
