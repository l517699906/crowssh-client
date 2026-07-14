import { AGENTS } from "../../hooks/useChat";

interface Props {
  value: string;
  onChange: (id: string) => void;
}

export function AgentSelect({ value, onChange }: Props) {
  return (
    <select
      className="select agent-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="选择智能体"
    >
      {AGENTS.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
