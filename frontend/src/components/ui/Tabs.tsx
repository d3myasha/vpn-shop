export type TabItem = {
  id: string;
  label: string;
  disabled?: boolean;
};

type Props = {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
};

export function Tabs({ tabs, activeId, onChange, className }: Props) {
  return (
    <div className={['ui-tabs', className ?? ''].filter(Boolean).join(' ')} role="tablist" aria-label="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeId === tab.id}
          className={["ui-tab", activeId === tab.id ? 'is-active' : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(tab.id)}
          disabled={tab.disabled}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
