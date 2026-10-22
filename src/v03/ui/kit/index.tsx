import {
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ComponentProps,
  type ReactNode,
} from 'react';

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      {...props}
      className={`v03-button button-${variant} button-${size} ${className}`}
    />
  );
}
export function IconButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string },
) {
  return <Button {...props} size="sm" />;
}
export function ActionButton({
  reason,
  disabled,
  title,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { reason?: string | null }) {
  return (
    <Button
      {...props}
      disabled={disabled || Boolean(reason)}
      title={reason ?? title}
      aria-description={reason ?? undefined}
    />
  );
}
export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={`v03-input ${props.className ?? ''}`} />;
}
export function Select(props: ComponentProps<'select'>) {
  return <select {...props} className={`v03-input ${props.className ?? ''}`} />;
}
export function Panel({
  title,
  help,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { title: string; help?: ReactNode }) {
  return (
    <section {...props} className={`v03-panel ${props.className ?? ''}`}>
      <header>
        <h3>{title}</h3>
        {help}
      </header>
      {children}
    </section>
  );
}
export function StatGrid({ values }: { values: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="v03-stat-grid">
      {values.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Badge({ children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...props} className={`v03-badge ${props.className ?? ''}`}>
      {children}
    </span>
  );
}
export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: string }[];
  label: string;
}) {
  return (
    <nav className="v03-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <Button
          key={tab.value}
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          onKeyDown={(event) => {
            const index = tabs.findIndex((entry) => entry.value === value);
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              event.preventDefault();
              onChange(
                tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!
                  .value,
              );
              (
                event.currentTarget.parentElement?.children[
                  (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
                ] as HTMLElement
              )?.focus();
            }
          }}
        >
          {tab.label}
        </Button>
      ))}
    </nav>
  );
}
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <label className="v03-field" aria-describedby={hint || error ? id : undefined}>
      <span>{label}</span>
      {children}
      {hint || error ? (
        <small id={id} role={error ? 'alert' : undefined}>
          {error ?? hint}
        </small>
      ) : null}
    </label>
  );
}
export function Toast({
  children,
  onClose,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
}) {
  return (
    <div className="v03-toast" role="status">
      {children}
      <IconButton aria-label={label} onClick={onClose}>
        ×
      </IconButton>
    </div>
  );
}
