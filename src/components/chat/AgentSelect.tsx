import type { Agent } from "../../types";

interface Props {
  value: string;
  agents: Agent[];
  onChange: (id: string) => void;
  disabled: boolean;
}

export function AgentSelect({ value, agents, onChange, disabled }: Props) {
  return (
    <select
      className="select agent-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      title="选择智能体"
    >
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
