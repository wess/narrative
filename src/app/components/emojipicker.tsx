import { useEffect, useRef } from "react";

const EMOJI = [
  "📄",
  "📝",
  "📌",
  "⭐",
  "💡",
  "🔥",
  "🎯",
  "🚀",
  "📚",
  "🧠",
  "🗂️",
  "📁",
  "🔖",
  "✅",
  "📅",
  "🗓️",
  "📊",
  "📈",
  "💼",
  "🛠️",
  "⚙️",
  "🔧",
  "🧩",
  "🎨",
  "🖋️",
  "✏️",
  "📐",
  "🔍",
  "🔬",
  "🧪",
  "🌱",
  "🌳",
  "🌍",
  "🏔️",
  "🌊",
  "☀️",
  "🌙",
  "⚡",
  "❄️",
  "🍀",
  "🎵",
  "🎬",
  "📷",
  "🎮",
  "♟️",
  "🧭",
  "🗺️",
  "🏷️",
  "💬",
  "📮",
  "✉️",
  "📞",
  "🔔",
  "❤️",
  "🙂",
  "🤔",
  "😎",
  "👀",
  "🤝",
  "👤",
  "🏠",
  "🏢",
  "🛏️",
  "🍵",
  "🍎",
  "🥑",
  "🏃",
  "🧘",
  "💪",
  "💊",
  "🐱",
  "🐶",
  "🦊",
  "🐢",
  "🦉",
  "🌟",
  "✨",
  "🎉",
  "🎁",
  "🔮",
];

export type EmojiPickerProps = {
  readonly value: string;
  readonly onPick: (emoji: string) => void;
  readonly onClose: () => void;
};

export const EmojiPicker = ({ value, onPick, onClose }: EmojiPickerProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="emoji-picker" ref={ref}>
      {value ? (
        <button type="button" className="emoji-clear" onClick={() => onPick("")}>
          Remove icon
        </button>
      ) : null}
      <div className="emoji-grid">
        {EMOJI.map((emoji) => (
          <button
            type="button"
            key={emoji}
            className="emoji-cell"
            data-active={emoji === value}
            onClick={() => onPick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};
