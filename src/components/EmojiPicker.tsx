import React from "react";
import { Smile, Heart, Star, Sparkles, Flame, ThumbsUp, Laugh, Image, Check } from "lucide-react";

const EMOJI_CATEGORIES = [
  {
    name: "Popular",
    icon: Sparkles,
    emojis: ["😀", "😂", "🥰", "👍", "🔥", "🎉", "❤️", "🤔", "👀", "✨", "🚀", "💀"]
  },
  {
    name: "Smileys",
    icon: Laugh,
    emojis: ["😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "😘", "😜", "😎", "🤓", "🥳", "🥺", "😭", "😤", "🤯", "😴", "🤖"]
  },
  {
    name: "Gestures",
    icon: ThumbsUp,
    emojis: ["👏", "🙌", "🙏", "💪", "✌️", "👌", "✍️", "👋", "🙅‍♂️", "🙆‍♀️", "🙇‍♂️"]
  },
  {
    name: "Hearts & Stars",
    icon: Heart,
    emojis: ["💖", "💗", "💓", "💔", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "⭐", "🌟", "💫", "💯"]
  }
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = React.useState(0);

  return (
    <div id="emoji-picker-popover" className="absolute bottom-16 left-0 z-50 w-72 bg-slate-800 border border-slate-700 rounded-2xl shadow-xl p-3 flex flex-col space-y-2">
      <div id="emoji-header" className="flex items-center justify-between border-b border-slate-700/50 pb-2">
        <span className="text-xs font-semibold text-slate-300">Insert Emoji</span>
        <button
          id="close-emoji-picker"
          onClick={onClose}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
        >
          Done
        </button>
      </div>

      {/* Categories Bar */}
      <div id="emoji-tabs" className="flex space-x-1 border-b border-slate-700/30 pb-1.5">
        {EMOJI_CATEGORIES.map((cat, idx) => {
          const Icon = cat.icon;
          const isActive = idx === activeCategory;
          return (
            <button
              key={cat.name}
              id={`emoji-cat-btn-${idx}`}
              type="button"
              title={cat.name}
              onClick={() => setActiveCategory(idx)}
              className={`p-1.5 rounded-lg transition-colors flex-1 flex justify-center ${
                isActive ? "bg-indigo-500/20 text-indigo-400" : "text-slate-400 hover:bg-slate-700/50 hover:text-slate-300"
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      {/* Emojis Grid */}
      <div id="emoji-grid" className="grid grid-cols-6 gap-2 max-h-36 overflow-y-auto py-1">
        {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
          <button
            key={emoji}
            id={`emoji-${emoji}`}
            type="button"
            onClick={() => onSelect(emoji)}
            className="text-xl p-1.5 rounded-lg hover:bg-slate-700/50 active:bg-slate-700 transition-colors flex items-center justify-center"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
