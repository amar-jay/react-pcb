import {describe, expect, test} from 'bun:test';
import React from 'react';
import {Board, Part, Route, RouteThrough, net, pad, part, rect} from './index.ts';
import {renderDeclarations} from './renderer/index.ts';

describe('React PCB renderer', () => {
  test('renders JSX into a declaration transaction', async () => {
    const VCC = net('3V3');
    const U1 = part('U1');
    const C1 = part('C1');
    const declarations = await renderDeclarations(
      <Board outline={rect(0, 0, 40, 30)} layers={2} metadata={{title: 'Test board'}}>
        <Part id={U1} footprint="QFN-32" connect={{VDD: VCC}} />
        <Part id={C1} footprint="0402" value="100nF" connect={{1: VCC}} />
        <Route net={VCC} from={pad(C1, '1')} to={pad(U1, 'VDD')}>
          <RouteThrough region={rect(10, 10, 5, 5)} />
        </Route>
      </Board>,
    );
    expect(declarations.children).toHaveLength(1);
    expect(declarations.children[0]?.type).toBe('pcb-board');
    expect(declarations.children[0]?.children.map(node => node.type)).toEqual(['pcb-part', 'pcb-part', 'pcb-route']);
    expect(declarations.children[0]?.children[2]?.children[0]?.type).toBe('pcb-route-through');
  });
});
