import type { Icon, IconProps } from "@phosphor-icons/react";
import { BlueprintIcon } from "@phosphor-icons/react/dist/csr/Blueprint";
import { CircuitryIcon } from "@phosphor-icons/react/dist/csr/Circuitry";
import { CpuIcon } from "@phosphor-icons/react/dist/csr/Cpu";
import { GraphIcon } from "@phosphor-icons/react/dist/csr/Graph";
import { StackIcon } from "@phosphor-icons/react/dist/csr/Stack";

// Import individual SVGs so the preview only bundles the icons it uses.
// Phosphor Icons (MIT): https://github.com/phosphor-icons/react
function pcbIcon(IconSvg: Icon, kind: string) {
	return function PcbIcon({ size = 16, ...props }: IconProps) {
		return (
			<IconSvg
				size={size}
				weight="duotone"
				aria-hidden="true"
				focusable="false"
				data-pcb-icon={kind}
				{...props}
			/>
		);
	};
}

export const BoardIcon = pcbIcon(CircuitryIcon, "board");
export const ComponentIcon = pcbIcon(CpuIcon, "component");
export const LayerStackIcon = pcbIcon(StackIcon, "layers");
export const NetIcon = pcbIcon(GraphIcon, "net");
export const AnalysisIcon = pcbIcon(BlueprintIcon, "analysis");
