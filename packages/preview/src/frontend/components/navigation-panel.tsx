import { useState } from 'react';
import {
  Box,
  ChevronRight,
  ChevronDown,
  CircuitBoard,
  Layers3,
  Network,
  Search,
  X,
} from 'lucide-react';
import type { BoardIr } from '@react-pcb/core';
import type { SceneLayer } from '../lib/scene.ts';
import { Button } from './ui/button';
import { Input } from './ui/input';

type Props = {
  ir: BoardIr | undefined;
  selected: string | null;
  layers: SceneLayer[];
  visibility: Record<string, boolean>;
  onSelect: (id: string) => void;
  onToggle: (key: string, visible: boolean) => void;
};

export function NavigationPanel({
  ir,
  selected,
  layers,
  visibility,
  onSelect,
  onToggle,
}: Props) {
  const [tab, setTab] = useState<'layers' | 'parts'>('layers');
  const [query, setQuery] = useState('');
  const parts =
    ir?.parts.filter((part) => {
      const component = ir.componentDefinitions[part.component];
      return [
        part.reference,
        part.footprint,
        component?.mpn,
        component?.value,
        component?.manufacturer,
      ].some((value) => value?.toLowerCase().includes(query.toLowerCase()));
    }) ?? [];
  return (
    <aside className="navigation-panel" aria-label="Board navigation">
      <div className="panel-heading">
        <h2>Design</h2>
        <span>
          {
            layers.filter((layer) => visibility[layer.key] ?? layer.visible)
              .length
          }{' '}
          visible
        </span>
      </div>
      <div className="navigation-tabs">
        <Button
          variant="ghost"
          aria-pressed={tab === 'layers'}
          onClick={() => setTab('layers')}
        >
          <Layers3 />
          Layers
        </Button>
        <Button
          variant="ghost"
          aria-pressed={tab === 'parts'}
          onClick={() => setTab('parts')}
        >
          <Box />
          Parts<small>{ir?.parts.length ?? 0}</small>
        </Button>
      </div>
      <div className="navigation-content" hidden={tab !== 'layers'}>
        <div id="layers">
          <details className="layer-group" open>
            <summary>
              <span>Copper</span>
              <small>
                {layers.filter((layer) => layer.category === 'copper').length}
              </small>
              <ChevronDown size={14} />
            </summary>
            <LayerList
              items={layers.filter((layer) => layer.category === 'copper')}
              visibility={visibility}
              onToggle={onToggle}
            />
          </details>
          <details className="layer-group" open>
            <summary>
              <span>Technical</span>
              <small className="side-legend" title="F: front · B: back">
                F · B
              </small>
              <ChevronDown size={14} />
            </summary>
            {[
              ...new Set(
                layers
                  .filter((layer) => layer.category === 'technical')
                  .map((layer) => layer.group),
              ),
            ].map((name) => {
              const pair = layers.filter(
                (layer) =>
                  layer.category === 'technical' && layer.group === name,
              );
              if (new Set(pair.map((layer) => layer.side)).size < pair.length)
                return (
                  <div className="technical-duplicate-group" key={name}>
                    <h3>{name}</h3>
                    <LayerList
                      items={pair}
                      visibility={visibility}
                      onToggle={onToggle}
                    />
                  </div>
                );
              return (
                <div className="technical-row" key={name}>
                  <span
                    className="technical-swatch"
                    style={{ background: pair[0]!.color }}
                  />
                  <span>{name}</span>
                  <div className="side-toggles">
                    {pair.map((layer) => (
                      <label
                        className="layer-side"
                        data-side={layer.side ?? 'shared'}
                        key={layer.key}
                        title={`${layer.name} · ${layer.id}`}
                      >
                        <input
                          type="checkbox"
                          aria-label={layer.name}
                          checked={visibility[layer.key] ?? layer.visible}
                          onChange={(event) =>
                            onToggle(layer.key, event.target.checked)
                          }
                        />
                        <span>
                          {layer.side === 'front'
                            ? 'F'
                            : layer.side === 'back'
                              ? 'B'
                              : '•'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </details>
          <details className="layer-group overlay-group" open>
            <summary>
              <span>Overlays</span>
              <ChevronDown size={14} />
            </summary>
            <LayerList
              items={layers.filter((layer) => layer.overlay)}
              visibility={visibility}
              onToggle={onToggle}
            />
          </details>
        </div>
        {!layers.length && (
          <p className="empty-copy">Layers appear after the board compiles.</p>
        )}
      </div>
      <div className="navigation-content" hidden={tab !== 'parts'}>
        <div className="part-search">
          <Search size={14} />
          <Input
            aria-label="Search parts"
            placeholder="Search parts…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear part search"
              onClick={() => setQuery('')}
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="section-heading">
          <h2>Parts</h2>
          <span>
            {parts.length}
            {query ? ` / ${ir?.parts.length ?? 0}` : ''}
          </span>
        </div>
        <div id="parts" className="parts-list">
          {parts.map((item) => {
            const component = ir!.componentDefinitions[item.component];
            return (
              <button
                type="button"
                key={item.id}
                className="part-row"
                data-part-id={item.id}
                aria-pressed={selected === item.id}
                onClick={() => onSelect(item.id)}
              >
                <span className="part-reference">{item.reference}</span>
                <span className="part-label">
                  {component?.mpn ?? component?.value ?? item.footprint}
                  <small>
                    {!item.at
                      ? 'Unplaced'
                      : !Object.keys(item.physicalFeatures).length
                        ? 'No physical geometry'
                        : `${item.side === 'front' ? 'Front' : 'Back'} side`}
                  </small>
                </span>
                <ChevronRight size={13} />
              </button>
            );
          })}
          {!parts.length && (
            <p className="empty-copy">
              {query ? 'No parts match your search.' : 'No parts declared.'}
            </p>
          )}
        </div>
      </div>
      <div className="navigation-footer">
        <CircuitBoard size={14} />
        <span>{ir?.parts.length ?? 0} parts</span>
        <span className="footer-dot" />
        <Network size={13} />
        <span>{ir?.nets.length ?? 0} nets</span>
      </div>
    </aside>
  );
}

function LayerList({
  items,
  visibility,
  onToggle,
}: {
  items: SceneLayer[];
  visibility: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
}) {
  return items.map((layer) => (
    <label
      key={layer.key}
      className={`layer-row ${layer.overlay ? 'overlay-row' : ''}`}
      title={layer.id}
    >
      <input
        type="checkbox"
        aria-label={layer.name}
        checked={visibility[layer.key] ?? layer.visible}
        onChange={(event) => onToggle(layer.key, event.target.checked)}
      />
      <span className="layer-swatch" style={{ background: layer.color }} />
      <span className="layer-name">
        {layer.name}
        {!layer.overlay && (
          <small>
            {layer.category === 'copper'
              ? layer.detail.charAt(0).toUpperCase() + layer.detail.slice(1)
              : layer.detail}
          </small>
        )}
      </span>
    </label>
  ));
}
