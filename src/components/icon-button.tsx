import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon, type IconName } from "@/components/icons";

type IconButtonProps = Omit<ComponentProps<typeof Button>, "children" | "aria-label"> & {
  icon: IconName;
  /** Accessible name and tooltip text (design.md section 6). */
  label: string;
  iconClassName?: string;
};

/** A ghost icon button with an accessible name and a tooltip that keyboard focus also opens. */
export function IconButton({
  icon,
  label,
  iconClassName,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant={variant} size={size} aria-label={label} {...props} />}>
        <Icon name={icon} className={iconClassName} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
