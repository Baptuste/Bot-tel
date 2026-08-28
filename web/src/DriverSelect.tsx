import type { Driver } from './types';

interface Props {
  drivers: Driver[];
  value: number | null;
  onChange: (driverId: number | null) => void;
  disabled?: boolean;
}

/** Liste deroulante de livreurs (actifs + celui deja affecte meme inactif). */
export function DriverSelect({ drivers, value, onChange, disabled }: Props) {
  const options = drivers.filter((d) => d.active || d.id === value);

  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">— Aucun livreur —</option>
      {options.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
          {d.active ? '' : ' (inactif)'}
        </option>
      ))}
    </select>
  );
}
