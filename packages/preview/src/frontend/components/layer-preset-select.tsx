import { layerPresets, type LayerPresetId } from '../lib/layer-presets.ts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

export function LayerPresetSelect({
  value,
  disabled,
  onSelect,
}: {
  value: LayerPresetId | 'custom';
  disabled: boolean;
  onSelect: (preset: LayerPresetId) => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 px-1">
      <span className="shrink-0 text-[12px] text-muted-foreground">View</span>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(value) => {
          const preset = layerPresets.find((preset) => preset.id === value);
          if (preset) onSelect(preset.id);
        }}
      >
        <SelectTrigger
          aria-label="Layer preset"
          className="h-8 min-w-0 flex-1 px-2 text-[12px] data-[size=default]:h-8"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {value === 'custom' && (
            <SelectItem value="custom" disabled>
              Custom
            </SelectItem>
          )}
          {layerPresets.map((preset) => (
            <SelectItem
              key={preset.id}
              value={preset.id}
              title={preset.description}
            >
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
