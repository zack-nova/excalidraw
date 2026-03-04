import clsx from "clsx";

import "./Switch.scss";

export type SwitchProps = {
  name: string;
  checked: boolean;
  title?: string;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export const Switch = ({
  title,
  name,
  checked,
  onChange,
  disabled = false,
  className,
}: SwitchProps) => {
  return (
    <div className={clsx("Switch", className, { toggled: checked, disabled })}>
      <input
        name={name}
        id={name}
        title={title}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(!checked)}
        onKeyDown={(event) => {
          if (event.key === " ") {
            onChange(!checked);
          }
        }}
      />
    </div>
  );
};
