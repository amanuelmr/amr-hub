"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

export type LightboxImage = { src: string; name: string };

/** Adds `src` to the list when it is missing; returns the list and its index. */
export function withImage(images: LightboxImage[], image: LightboxImage) {
  const index = images.findIndex((candidate) => candidate.src === image.src);
  if (index !== -1) return { images, index };
  return { images: [image, ...images], index: 0 };
}

/**
 * Full-screen preview for image attachments and inline images. ← / → move
 * between the issue's images; Esc closes.
 */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const image = images[index];
  if (!image) return null;
  const hasMany = images.length > 1;
  const move = (delta: number) =>
    onIndexChange((index + delta + images.length) % images.length);

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="lightbox-overlay" />
        <Dialog.Content
          className="lightbox"
          aria-describedby={undefined}
          onKeyDown={(event) => {
            if (!hasMany) return;
            if (event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            }
          }}
        >
          <header className="lightbox-bar">
            <Dialog.Title className="lightbox-title">{image.name}</Dialog.Title>
            {hasMany && (
              <span className="lightbox-count">
                {index + 1} of {images.length}
              </span>
            )}
            <a
              className="icon-button lightbox-action"
              href={image.src}
              download={image.name}
              aria-label={`Download ${image.name}`}
              title="Download"
            >
              <Download size={16} aria-hidden="true" />
            </a>
            <Dialog.Close asChild>
              <button
                className="icon-button lightbox-action"
                type="button"
                aria-label="Close preview"
                title="Close (Esc)"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <div className="lightbox-stage">
            {hasMany && (
              <button
                className="lightbox-nav is-prev"
                type="button"
                aria-label="Previous image"
                onClick={() => move(-1)}
              >
                <ChevronLeft size={22} aria-hidden="true" />
              </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.src} alt={image.name} />
            {hasMany && (
              <button
                className="lightbox-nav is-next"
                type="button"
                aria-label="Next image"
                onClick={() => move(1)}
              >
                <ChevronRight size={22} aria-hidden="true" />
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
