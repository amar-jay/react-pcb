import React from 'react';
import {Part, type PartProps} from '../components/index.ts';
import type {FootprintBinding} from '../footprints/index.ts';
import type {Net} from '../model/index.ts';

export type ElectricalType =
  | 'power-input'
  | 'power-output'
  | 'input'
  | 'output'
  | 'bidirectional'
  | 'passive';

export type PinDefinition = Readonly<{
  electricalType: ElectricalType;
  functions?: readonly string[];
  required?: boolean;
}>;

export type DatasheetSource = Readonly<{
  url: string;
  document: string;
  revision?: string;
  page?: number;
}>;

export type PartDefinition<Pins extends Record<string, PinDefinition>> = Readonly<{
  /** Stable library identity. Defaults to a key derived from manufacturer and MPN. */
  key?: string;
  manufacturer: string;
  mpn: string;
  package: string;
  datasheet: DatasheetSource;
  pinoutCoverage: 'complete' | 'partial';
  pins: Pins;
}>;

type RequiredPins<Pins extends Record<string, PinDefinition>> = {
  [Name in keyof Pins]-?: Pins[Name] extends {required: true} ? Name : never;
}[keyof Pins];

export type PartConnections<Pins extends Record<string, PinDefinition>> =
  Partial<Record<Extract<keyof Pins, string>, Net>> &
  Record<Extract<RequiredPins<Pins>, string>, Net>;

export type DefinedPartProps<Pins extends Record<string, PinDefinition>> =
  Pick<PartProps, 'id' | 'at' | 'side' | 'rotation'> & {
    connect: PartConnections<Pins>;
  };

export function definePart<const Pins extends Record<string, PinDefinition>>(
  definition: PartDefinition<Pins>,
  binding: FootprintBinding,
) {
  if (definition.key !== undefined && definition.key.trim().length === 0) {
    throw new Error('part definition key must be non-empty');
  }
  function DefinedPart({id, at, side, rotation, connect}: DefinedPartProps<Pins>) {
    for (const name of Object.keys(connect)) {
      if (!(name in definition.pins)) {
        throw new Error(`${definition.mpn} has no pin named ${name}`);
      }
    }

    for (const [name, pin] of Object.entries(definition.pins)) {
      if (pin.required && !(name in connect)) {
        throw new Error(`${definition.mpn} requires a connection for ${name}`);
      }
    }

    return (
      <Part
        id={id}
        mpn={definition.mpn}
        footprint={binding.footprint}
        pinMap={binding.pinMap}
        at={at}
        side={side}
        rotation={rotation}
        connect={connect}
        definition={definition}
      />
    );
  }

  DefinedPart.displayName = definition.mpn;
  return DefinedPart;
}
