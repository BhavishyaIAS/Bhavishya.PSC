"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useState } from "react";

export type DragHandle = (label: string) => React.ReactNode;

function Row({ id, children }: { id: number; children: (handle: DragHandle) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle: DragHandle = (label) => (
    <button type="button" className="drag-handle" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Reorder ${label}`} title="Drag to reorder (or focus and use Space + arrow keys)">
      <GripVertical size={16} aria-hidden />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.7 : 1, position: "relative", zIndex: isDragging ? 5 : undefined }}
    >
      {children(handle)}
    </div>
  );
}

/**
 * One sibling list (e.g. the subjects of a paper). Drag — or keyboard: focus a
 * handle, Space, arrows, Space — then the new order is persisted.
 */
export function SortableList<T extends { id: number }>({
  items,
  onReorder,
  render,
}: {
  items: T[];
  onReorder: (ordered: T[]) => Promise<void>;
  render: (item: T, handle: DragHandle) => React.ReactNode;
}) {
  // Optimistic local order; resynced whenever the parent hands us a new list.
  const [local, setLocal] = useState(items);
  const [prev, setPrev] = useState(items);
  if (items !== prev) {
    setPrev(items);
    setLocal(items);
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = local.findIndex((i) => i.id === active.id);
    const to = local.findIndex((i) => i.id === over.id);
    const next = arrayMove(local, from, to);
    setLocal(next);
    onReorder(next).catch(() => setLocal(items));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={local.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {local.map((item) => (
          <Row key={item.id} id={item.id}>
            {(handle) => render(item, handle)}
          </Row>
        ))}
      </SortableContext>
    </DndContext>
  );
}
