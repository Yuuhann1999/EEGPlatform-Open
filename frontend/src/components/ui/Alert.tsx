import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '../../utils/cn';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

const variantStyles: Record<AlertVariant, string> = {
  info: 'border-eeg-accent/30 bg-eeg-accent/10 text-eeg-text',
  success: 'border-eeg-success/30 bg-eeg-success/10 text-eeg-success',
  warning: 'border-eeg-warning/30 bg-eeg-warning/10 text-eeg-warning',
  error: 'border-eeg-error/30 bg-eeg-error/10 text-eeg-error',
};

const variantIcon: Record<AlertVariant, React.ComponentType<{ size?: number; className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

export function Alert({
  variant = 'info',
  title,
  description,
  className,
}: {
  variant?: AlertVariant;
  title: string;
  description?: string;
  className?: string;
}) {
  const Icon = variantIcon[variant];

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        variantStyles[variant],
        className
      )}
      role="alert"
    >
      <Icon size={16} className="mt-0.5 flex-shrink-0" />
      <div>
        <div className="font-medium">{title}</div>
        {description ? <div className="text-xs text-eeg-text-muted mt-0.5">{description}</div> : null}
      </div>
    </div>
  );
}
