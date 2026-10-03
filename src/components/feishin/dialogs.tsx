"use client";
// Feishin rebuild — dialogs (create/rename playlist)
import { useState } from "react";
import { DialogNS as Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePlaylistsStore } from "@/store/playlists-store";
import { toast } from "sonner";

export function CreatePlaylistDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const create = usePlaylistsStore((s) => s.create);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] p-5 shadow-2xl focus:outline-none">
          <Dialog.Title className="mb-4 text-lg font-extrabold text-[var(--fg)]">Create playlist</Dialog.Title>
          <Dialog.Description className="sr-only">Enter a name for the new playlist</Dialog.Description>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                const pl = create(name.trim());
                toast(`Created playlist "${pl.name}"`);
                onCreated?.(pl.id);
                setName("");
                onOpenChange(false);
              }
            }}
            placeholder="Playlist name"
            className="fs-input mb-4 w-full px-3 py-2 text-[13.5px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!name.trim()}
              onClick={() => {
                const pl = create(name.trim());
                toast(`Created playlist "${pl.name}"`);
                onCreated?.(pl.id);
                setName("");
                onOpenChange(false);
              }}
            >
              Create
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
