import React from "react";

const PRESET_AVATARS = [
  "Buster", "Jasper", "Shadow", "Bella", "Max", "Lola", "Rocky", "Coco",
  "Felix", "Oliver", "Leo", "Milo", "Chloe", "Lily", "Luna", "Sasha"
];

interface AvatarPickerProps {
  selectedSeed: string;
  onSelect: (seed: string) => void;
}

export default function AvatarPicker({ selectedSeed, onSelect }: AvatarPickerProps) {
  return (
    <div id="avatar-picker-container" className="space-y-2">
      <label className="text-sm font-medium text-slate-300 block">Choose an Avatar</label>
      <div id="avatar-grid" className="grid grid-cols-8 gap-2 bg-slate-800 p-3 rounded-xl max-h-36 overflow-y-auto border border-slate-700">
        {PRESET_AVATARS.map((seed) => {
          const url = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;
          const isSelected = selectedSeed === seed;
          return (
            <button
              key={seed}
              id={`avatar-btn-${seed}`}
              type="button"
              onClick={() => onSelect(seed)}
              className={`relative rounded-full overflow-hidden p-0.5 border-2 transition-all hover:scale-110 ${
                isSelected ? "border-indigo-500 scale-105 bg-indigo-500/10" : "border-transparent bg-slate-700/50"
              }`}
            >
              <img
                src={url}
                alt={`Avatar ${seed}`}
                className="w-10 h-10 object-cover"
                referrerPolicy="no-referrer"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
