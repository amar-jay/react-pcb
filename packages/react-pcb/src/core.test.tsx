import {describe, expect, test} from 'bun:test';
import React from 'react';
import {
  Board, Module, Part, Route, RouteThrough, copperLayer, defineLayerSet, defineStackup,
  dielectricLayer, net, pad, part, rect, useNet, usePart,
} from './index.ts';
import {renderDeclarations} from './renderer/index.ts';

const testLayers = defineLayerSet({
  stackup: defineStackup([
    copperLayer('F.Cu', {thickness: 0.035}),
    dielectricLayer('Core', {material: 'FR-4', thickness: 1.5, epsilonR: 4.2}),
    copperLayer('B.Cu', {thickness: 0.035}),
  ]),
});

describe('React PCB renderer', () => {
  test('renders JSX into a declaration transaction', async () => {
    const VCC = net('3V3');
    const U1 = part('U1');
    const C1 = part('C1');
    const declarations = await renderDeclarations(
      <Board outline={rect(0, 0, 40, 30)} layers={testLayers} metadata={{title: 'Test board'}}>
        <Part id={U1} footprint="QFN-32" connect={{VDD: VCC}} />
        <Part id={C1} footprint="0402" value="100nF" connect={{1: VCC}} />
        <Route net={VCC} from={pad(C1, '1')} to={pad(U1, 'VDD')}>
          <RouteThrough region={rect(10, 10, 5, 5)} />
        </Route>
      </Board>,
    );
    expect(declarations.children).toHaveLength(1);
    expect(declarations.children[0]?.type).toBe('pcb-board');
    expect(declarations.children[0]?.props.layers).toMatchObject({
      kind: 'layer-set',
      stackup: {kind: 'stackup', copperLayerCount: 2},
    });
    expect(declarations.children[0]?.children.map(node => node.type)).toEqual(['pcb-part', 'pcb-part', 'pcb-route']);
    expect(declarations.children[0]?.children[2]?.children[0]?.type).toBe('pcb-route-through');
  });

  test('scopes identical local net and part names by module', async () => {
    function LocalCircuit() {
      const signal = useNet('SIG');
      const device = usePart('U1');
      return <Part id={device} footprint="TEST" connect={{1: signal}} />;
    }

    const declarations = await renderDeclarations(
      <Board outline={rect(0, 0, 10, 10)} layers={testLayers}>
        <Module name="left"><LocalCircuit /></Module>
        <Module name="right"><LocalCircuit /></Module>
      </Board>,
    );

    const modules = declarations.children[0]?.children ?? [];
    expect(modules[0]?.children[0]?.props.id).toEqual({kind: 'part', id: 'left/U1', reference: 'U1'});
    expect(modules[1]?.children[0]?.props.id).toEqual({kind: 'part', id: 'right/U1', reference: 'U1'});
    expect(modules[0]?.children[0]?.props.connect).toEqual({
      1: {kind: 'net', id: 'left/SIG', name: 'SIG'},
    });
    expect(modules[1]?.children[0]?.props.connect).toEqual({
      1: {kind: 'net', id: 'right/SIG', name: 'SIG'},
    });
  });
});
