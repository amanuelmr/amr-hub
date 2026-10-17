"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Settings2, Trash2 } from "lucide-react";
import { GadgetBody } from "./Gadgets";
import { GadgetConfigForm } from "./GadgetConfigForm";
import {
  GADGET_META,
  gadgetTitle,
  type Gadget,
  type GadgetConfig,
} from "./gadgetMeta";

export function GadgetCard({
  gadget,
  editing,
  onConfigure,
  onRemove,
}: {
  gadget: Gadget;
  editing: boolean;
  onConfigure: (config: GadgetConfig) => void;
  onRemove: () => void;
}) {
  const [isConfiguring, setIsConfiguring] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: gadget.id, disabled: !editing });
  const title = gadgetTitle(gadget);

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`panel gadget-card${isDragging ? " dragging" : ""}${
        editing ? " editing" : ""
      }`}
      aria-label={title}
    >
      <div className="panel-header gadget-header">
        {editing && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="icon-button gadget-handle"
            aria-label={`Reorder ${title}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} aria-hidden="true" />
          </button>
        )}
        <div className="gadget-heading">
          <h2>{title}</h2>
          {title !== GADGET_META[gadget.type].label && (
            <p>{GADGET_META[gadget.type].label}</p>
          )}
        </div>
        {editing && (
          <div className="gadget-tools">
            <button
              type="button"
              className="icon-button"
              aria-label={`Configure ${title}`}
              aria-expanded={isConfiguring}
              onClick={() => setIsConfiguring((current) => !current)}
            >
              <Settings2 size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button danger"
              aria-label={`Remove ${title}`}
              onClick={onRemove}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {editing && isConfiguring ? (
        <GadgetConfigForm
          gadget={gadget}
          onCancel={() => setIsConfiguring(false)}
          onSave={(config) => {
            onConfigure(config);
            setIsConfiguring(false);
          }}
        />
      ) : (
        <div className="gadget-body">
          <GadgetBody gadget={gadget} />
        </div>
      )}
    </article>
  );
}
