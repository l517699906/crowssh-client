import { useRef } from "react";

/** 可拖拽的垂直分隔条：报告水平位移增量 dx 给父组件 */
export function Splitter({ onResize }: { onResize: (dx: number) => void }) {
  const startX = useRef(0);

  const handleDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;

    const move = (ev: MouseEvent) => {
      onResize(ev.clientX - startX.current);
      startX.current = ev.clientX;
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return <div className="splitter" onMouseDown={handleDown} />;
}
