import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ theme = "system", ...props }: ToasterProps) => {
	return (
		<Sonner
			theme={theme}
			className="toaster group"
			icons={{
				success: <CircleCheckIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" />,
				error: <OctagonXIcon className="size-4" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--card)",
					"--normal-text": "var(--foreground)",
					"--normal-border": "var(--border)",
					"--success-bg":
						"color-mix(in srgb, var(--success) 9%, var(--card))",
					"--success-border":
						"color-mix(in srgb, var(--success) 22%, var(--border))",
					"--success-text": "var(--foreground)",
					"--error-bg":
						"color-mix(in srgb, var(--destructive) 9%, var(--card))",
					"--error-border":
						"color-mix(in srgb, var(--destructive) 22%, var(--border))",
					"--error-text": "var(--foreground)",
					"--warning-bg": "color-mix(in srgb, #9a7835 9%, var(--card))",
					"--warning-border":
						"color-mix(in srgb, #9a7835 22%, var(--border))",
					"--warning-text": "var(--foreground)",
					"--info-bg": "var(--card)",
					"--info-border": "var(--border)",
					"--info-text": "var(--foreground)",
					"--border-radius": "var(--radius-lg)",
				} as CSSProperties
			}
			{...props}
		/>
	);
};

export { Toaster };
