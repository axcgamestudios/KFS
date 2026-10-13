'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi, type InvEntry } from '@/game/api';
import { ITEMS } from '@/game/data/items';
import {
  BowArrow, Coins, Feather, FlaskConical, Flame, Flower2, Gem, KeyRound, Layers, Map as MapIcon, Package,
  ScrollText, Shield, Shirt, Sword, X, Zap,
} from 'lucide-react';

const ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  Coins, Feather, FlaskConical, Flower2, Gem, KeyRound, Map: MapIcon, Package, ScrollText, Shield, Shirt, Sword, Layers,
  BowArrow, Flame, Zap,
};

const KIND_LABEL: Record<string, string> = {
  weapon: 'Weapon', consumable: 'Consumable', material: 'Material',
  key: 'Key item', readable: 'Document', treasure: 'Treasure',
  armor: 'Armor', wings: 'Wings',
};

export default function InventoryUI() {
  const close = useGameStore((s) => s.closeOverlay);
  const [items, setItems] = useState<InvEntry[]>(() => gameApi.inventory());
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = () => setItems(gameApi.inventory());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        close();
        gameApi.clickResumeHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const selectedDef = selected ? ITEMS[selected] : null;
  const equipped = gameApi.equippedWeapon();
  const equippedArmor = gameApi.equippedArmor();
  const equippedWings = gameApi.equippedWings();
  const equippedAny =
    selected === equipped
    || selected === equippedArmor
    || selected === equippedWings;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="kotfs-panel kotfs-panel-corner w-full max-w-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="kotfs-title text-lg tracking-[0.25em] text-[color:var(--kotfs-gold)]">
            EXPLORER'S SATCHEL
          </h2>
          <button
            className="text-[color:var(--kotfs-parchment-dim)] transition hover:text-[color:var(--kotfs-parchment)]"
            onClick={() => {
              close();
              gameApi.clickResumeHint();
            }}
          >
            <X size={20} />
          </button>
        </div>
        <hr className="kotfs-hr mb-5" />

        {items.length === 0 ? (
          <p className="py-12 text-center italic text-[color:var(--kotfs-parchment-dim)]">
            Your satchel is empty. The island hides more treasures than it lets on…
          </p>
        ) : (
          <div className="grid grid-cols-[1fr_260px] gap-5">
            {/* Item grid */}
            <div className="kotfs-scroll grid max-h-[54vh] grid-cols-4 gap-2 overflow-y-auto pr-1 md:grid-cols-5">
              {items.map(({ id, count }) => {
                const def = ITEMS[id];
                const Icon = ICONS[def?.icon ?? 'Package'] ?? Package;
                const isEquipped = id === equipped || id === equippedArmor || id === equippedWings;
                return (
                  <button
                    key={id}
                    onClick={() => setSelected(id)}
                    className={`group relative flex aspect-square flex-col items-center justify-center border p-2 transition ${
                      selected === id
                        ? 'border-[color:var(--kotfs-gold)] bg-[rgba(201,162,39,0.12)]'
                        : 'border-[color:rgba(201,162,39,0.25)] bg-black/30 hover:border-[color:var(--kotfs-gold)]'
                    }`}
                  >
                    <Icon
                      size={26}
                      className={
                        def?.rarity === 'legendary'
                          ? 'kotfs-rarity-legendary'
                          : def?.rarity === 'rare'
                            ? 'kotfs-rarity-rare'
                            : 'text-[color:var(--kotfs-parchment-dim)]'
                      }
                    />
                    <span className="mt-1.5 line-clamp-2 text-center text-[0.6rem] leading-tight text-[color:var(--kotfs-parchment-dim)]">
                      {def?.name ?? id}
                    </span>
                    {count > 1 && (
                      <span className="kotfs-title absolute right-1 top-0.5 text-[0.65rem] text-[color:var(--kotfs-gold)]">
                        {count}
                      </span>
                    )}
                    {isEquipped && (
                      <span className="absolute left-1 top-0.5 text-[0.55rem] tracking-widest text-[color:var(--kotfs-gold)]">
                        EQ
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Detail panel */}
            <div className="flex flex-col border border-[color:rgba(201,162,39,0.25)] bg-black/30 p-4">
              {selectedDef ? (
                <>
                  <h3
                    className={`kotfs-title text-sm ${
                      selectedDef.rarity === 'legendary'
                        ? 'kotfs-rarity-legendary'
                        : selectedDef.rarity === 'rare'
                          ? 'kotfs-rarity-rare'
                          : 'text-[color:var(--kotfs-parchment)]'
                    }`}
                  >
                    {selectedDef.name}
                  </h3>
                  <p className="mt-0.5 text-[0.6rem] uppercase tracking-[0.25em] text-[color:var(--kotfs-parchment-dim)] opacity-70">
                    {KIND_LABEL[selectedDef.kind] ?? selectedDef.kind}
                  </p>
                  <p className="kotfs-scroll mt-3 flex-1 overflow-y-auto text-sm leading-relaxed text-[color:var(--kotfs-parchment-dim)]">
                    {selectedDef.desc}
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    {selectedDef.usable && (
                      <button
                        className="kotfs-btn w-full !py-2 text-xs"
                        onClick={() => {
                          gameApi.useItem(selectedDef.id);
                          refresh();
                        }}
                      >
                        Use
                      </button>
                    )}
                    {selectedDef.lore && (
                      <button
                        className="kotfs-btn w-full !py-2 text-xs"
                        onClick={() => gameApi.readItem(selectedDef.id)}
                      >
                        Read
                      </button>
                    )}
                    {selectedDef.equipable && (
                      <button
                        className="kotfs-btn w-full !py-2 text-xs"
                        onClick={() => {
                          if (equippedAny) {
                            // take THIS piece off (whichever slot it occupies)
                            if (selected === equipped) gameApi.unequipWeapon();
                            else if (selected === equippedArmor) gameApi.unequipArmor();
                            else if (selected === equippedWings) gameApi.unequipWings();
                          } else {
                            gameApi.equipItem(selectedDef.id);
                          }
                          refresh();
                        }}
                      >
                        {equippedAny ? 'Unequip' : 'Equip'}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-6 text-center italic text-xs text-[color:var(--kotfs-parchment-dim)] opacity-60">
                  Select an item to examine it
                </p>
              )}
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-[0.6rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-50">
          TAB / ESC TO CLOSE
        </p>
      </div>
    </div>
  );
}
