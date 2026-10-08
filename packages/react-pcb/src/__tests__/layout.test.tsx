import {expect, test} from 'bun:test';
import React from 'react';
import {
  Board, Footprint, FootprintGroup, Pad, Hole, Graphic, Part, compile, compileFootprint,
  definePhysicalFootprint, footprintSvg, part, net, rect, renderFootprintDeclarations,
  PcbCompileError, type FootprintDeclarations, type FootprintStyle,
} from '../index.ts';
import {testLayers} from './fixtures.ts';

const options = {cwd: import.meta.dir + '/../../../..', hideWarnings: true};
const style: FootprintStyle = {position: 'absolute', width: '0.6mm', height: '0.7mm', left: '0mm', top: '0mm'};
function passive(reverse = false) {
  const pads = [
    <Pad key="first" name="1" layers={['front-copper', 'front-mask', 'front-paste']} style={style} />,
    <Pad key="second" name="2" layers={['front-copper', 'front-mask', 'front-paste']}
      style={{...style, left: '1mm'}} />,
  ];
  return <Footprint name="example:0402" style={{width: '1.6mm', height: '0.7mm', left: '-0.8mm', top: '-0.35mm'}}>
    {reverse ? pads.reverse() : pads}
  </Footprint>;
}
const explicit = definePhysicalFootprint({key: 'example:0402', features: [
  {id: '1', purpose: 'pad', at: ['-0.5mm', '0mm'], shape: {kind: 'rect', size: ['0.6mm', '0.7mm']}, layers: ['front-copper', 'front-mask', 'front-paste']},
  {id: '2', purpose: 'pad', at: ['0.5mm', '0mm'], shape: {kind: 'rect', size: ['0.6mm', '0.7mm']}, layers: ['front-copper', 'front-mask', 'front-paste']},
]});

test('0402 JSX and explicit coordinates compile to identical canonical geometry and SVG', async () => {
  const declarations = await renderFootprintDeclarations(passive());
  expect(declarations.root.children[0]?.props.style).toEqual(style);
  expect(JSON.stringify(declarations)).not.toContain('bounds');
  const ir = await compileFootprint(declarations, options);
  expect(ir).toEqual(await compileFootprint(explicit, options));
  expect(await compileFootprint(passive(), options)).toEqual(ir);
  expect(JSON.stringify(await compileFootprint(JSON.parse(JSON.stringify(declarations)) as FootprintDeclarations, options))).toBe(JSON.stringify(ir));
  const svg = await footprintSvg(ir, options);
  expect(await footprintSvg(await compileFootprint(passive(true), options), options)).toBe(svg);
  expect(JSON.stringify(ir)).not.toContain('style');
  expect(JSON.stringify(ir)).not.toContain('sourceKey');
  const board = await compile(<Board outline={rect(0, 0, 20, 20)} layers={testLayers}>
    <Part id={part('C1')} at={[10, 10]} footprint={declarations} connect={{1: net('GND')}} />
    <Part id={part('C2')} at={[10, 10]} footprint={ir} side="back" connect={{1: net('GND')}} />
  </Board>, options);
  expect(board.ir.footprintDefinitions['example:0402']?.physical).toEqual(ir);
  expect(board.ir.parts[0]?.physicalFeatures['1']?.geometry.at).toEqual([9500000, 10000000]);
  expect(board.ir.parts[1]?.physicalFeatures['1']?.geometry.at).toEqual([10500000, 10000000]);
});

test('nested group transforms resolve analytically and wrappers emit no geometry', async () => {
  const ir = await compileFootprint(<Footprint name="nested" style={{width: '10mm', height: '8mm', left: '-5mm', top: '-4mm', transform: {translate: ['1mm', '2mm']}}}>
    <FootprintGroup name="inner" style={{position: 'absolute', width: '4mm', height: '2mm', left: '2mm', top: '1mm', transform: {reflectX: true, rotate: 90}}}>
      <Pad name="P" layers={['front-copper']} shape="rounded-rect" style={{position: 'absolute', width: '1mm', height: '0.5mm', left: '0.5mm', top: '0.25mm', borderRadius: '0.1mm', transform: {translate: ['0.2mm', '0.3mm'], rotate: 90}}} />
      <Hole name="H" plated={false} style={{position: 'absolute', width: '0.8mm', height: '0.8mm', right: '0mm', bottom: '0mm'}} />
    </FootprintGroup>
  </Footprint>, options);
  expect(ir.features).toHaveLength(2);
  // Pad center before parent reflection/rotation: (1.2, 0.8), group center (2,1).
  // Reflected and rotated: (2.2,1.8); root coordinates: (0.2,0.8).
  expect(ir.features[0]).toMatchObject({id: 'P', at: [200000, 800000], rotation: 180, shape: {kind: 'rounded-rect', size: [1000000, 500000], radius: 100000}});
  expect(ir.features[1]).toMatchObject({id: 'H', at: [-600000, -1600000], rotation: 270, drill: {diameter: 800000, plated: false}, layers: []});
});

test('JS mapping, mixed units, keyed graphics and group reflection preserve identities', async () => {
  const make = (reverse: boolean) => <Footprint name="mapped" style={{width: '0.2in', height: '5.08mm', transform: {reflectY: true, rotate: 270}}}>
    <FootprintGroup style={{position: 'absolute', width: '5080um', height: '5080000nm', left: '0mm', top: '0mm'}}>
      {(reverse ? [1, 0] : [0, 1]).map(i => <Graphic key={`mask-${i}`} purpose="mask-opening" shape="circle" layers={['all-mask']}
        style={{position: 'absolute', width: '20mil', height: '0.02in', left: `${i}mm`, top: '0mm'}} />)}
      <Graphic name="outline" purpose="courtyard" layers={['front-courtyard']} stroke="0.1mm" style={{position: 'absolute', width: '4mm', height: '4mm', left: '0mm', top: '0mm'}} />
    </FootprintGroup>
  </Footprint>;
  const before = await compileFootprint(make(false), options);
  const after = await compileFootprint(make(true), options);
  expect(Object.fromEntries(after.features.map(f => [f.id, f]))).toEqual(Object.fromEntries(before.features.map(f => [f.id, f])));
  expect(before.features[0]?.shape).toEqual({kind: 'circle', diameter: 508000});
  expect(before.features[0]?.at).toEqual([4826000, 4826000]);
  expect(await footprintSvg(before, options)).toBe(await footprintSvg(after, options));
});

test('unsupported and ambiguous inputs produce feature-scoped diagnostics with source', async () => {
  const declaration = await renderFootprintDeclarations(<Footprint name="bad" style={{width: '2mm', height: '2mm'}}>
    <Pad key="original" name="1" source={{file: 'fixtures/bad.tsx', line: 12, column: 3}} layers={['front-copper']} style={style} />
  </Footprint>);
  const invalidStyles: [Record<string, unknown>, string][] = [
    [{...style, display: 'flex'}, 'unsupported style property display'],
    [{...style, width: '50%'}, 'length requires'],
    [{...style, width: 1}, 'width must be a string'],
    [{...style, width: '1px'}, 'length requires'],
    [{...style, width: '0.1nm'}, 'finer than one nanometre'],
    [{...style, width: '9007199254740992nm'}, 'exact JSON integer range'],
    [{...style, left: undefined}, 'requires left or right'],
    [{...style, position: undefined}, 'requires position'],
    [{...style, right: '0mm'}, 'overdetermine'],
    [{...style, transform: 'rotate(90deg)'}, 'transform must be an object'],
    [{...style, transform: {rotate: 45}}, 'rotate must be'],
    [{...style, transform: {scale: 2}}, 'unsupported transform'],
    [{...style, transform: {reflectX: 'yes'}}, 'reflectX must be boolean'],
    [{...style, transform: {translate: ['1mm']}}, 'two physical lengths'],
    [{...style, width: '3nm'}, 'half-nanometre'],
    [{...style, width: '-1mm'}, 'positive'],
    [{...style, borderRadius: '1mm'}, 'borderRadius requires'],
  ];
  for (const [invalidStyle, message] of invalidStyles) {
    const input = structuredClone(declaration);
    input.root.children[0]!.props.style = invalidStyle;
    try {
      await compileFootprint(input, options);
      throw new Error(`expected rejection for ${message}`);
    } catch (error) {
      expect(error).toBeInstanceOf(PcbCompileError);
      expect((error as PcbCompileError).diagnostic).toMatchObject({entity: 'bad/1', source: {file: 'fixtures/bad.tsx', line: 12, column: 3}});
      expect((error as Error).message).toContain(message);
      expect((error as Error).message).toContain('fixtures/bad.tsx:12:3');
    }
  }
  const duplicate = structuredClone(declaration);
  duplicate.root.children.push(structuredClone(duplicate.root.children[0]!));
  await expect(compileFootprint(duplicate, options)).rejects.toThrow('ambiguous feature identity');
  const invalidLayer = structuredClone(declaration);
  invalidLayer.root.children[0]!.props.layers = ['front-courtyard'];
  await expect(compileFootprint(invalidLayer, options)).rejects.toThrow('incompatible');
});

test('invalid root and nonserializable frontend values fail explicitly', async () => {
  await expect(renderFootprintDeclarations(<Pad style={style} layers={['front-copper']} />)).rejects.toThrow('one Footprint root');
  await expect(renderFootprintDeclarations(<Footprint name="bad" style={{width: '1mm', height: '1mm'}}>
    <Pad style={{...style, transform: (() => 1) as never}} layers={['front-copper']} />
  </Footprint>)).rejects.toThrow('serializable');
  await expect(compileFootprint(<Footprint name="empty" style={{width: '1mm', height: '1mm'}} />, options)).rejects.toThrow('requires physical features');
  await expect(compileFootprint(<Footprint name="ambiguous" style={{width: '2mm', height: '2mm'}}>
    <Pad style={style} layers={['front-copper']} /><Pad style={{...style, left: '1mm'}} layers={['front-copper']} />
  </Footprint>, options)).rejects.toThrow('ambiguous feature identity');
});
