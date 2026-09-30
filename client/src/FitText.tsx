import { useLayoutEffect, useRef } from "react";

const MAX_FONT_PX = 16;
const MIN_FONT_PX = 9;

/**
 * Shows the whole text inside a fixed-height box: words wrap onto extra lines and the font
 * shrinks until everything fits. Never truncates; as a last resort long words break.
 */
export default function FitText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const span = textRef.current;
    if (!box || !span) return;

    const overflows = () =>
      span.offsetHeight > box.clientHeight ||
      span.scrollWidth > span.clientWidth;

    let size = MAX_FONT_PX;
    span.style.wordBreak = "normal";
    span.style.fontSize = `${size}px`;
    while (size > MIN_FONT_PX && overflows()) {
      size -= 0.5;
      span.style.fontSize = `${size}px`;
    }
    if (overflows()) {
      span.style.wordBreak = "break-all";
    }
  }, [text]);

  return (
    <div
      ref={boxRef}
      className={`flex items-center justify-center overflow-hidden ${className}`}
    >
      <span
        ref={textRef}
        className="block w-full text-center leading-tight"
        title={text}
      >
        {text}
      </span>
    </div>
  );
}
