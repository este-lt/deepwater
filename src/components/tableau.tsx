"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode, useState, useTransition } from "react";
import { choisirDisposition } from "@/app/actions";
import { useLangue } from "@/components/langue";
import { type Disposition, DISPOSITION_DEFAUT, type IdWidget, WIDGETS } from "@/lib/widgets";

const TITRES = Object.fromEntries(WIDGETS.map((w) => [w.id, w])) as Record<IdWidget, (typeof WIDGETS)[number]>;

function Bouton({ onClick, children, actif = false, titre }: { onClick: () => void; children: ReactNode; actif?: boolean; titre?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-pressed={actif}
      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
        actif ? "border-accent/60 bg-accent-doux text-accent-clair" : "border-bordure text-attenue hover:border-bordure-forte hover:text-texte"
      }`}
    >
      {children}
    </button>
  );
}

// Tuile réduite en mode personnalisation : poignée, titre, largeur, masquer.
function TuileEdition({ id, large, onLargeur, onMasquer }: { id: IdWidget; large: boolean; onLargeur: () => void; onMasquer: () => void }) {
  const { t } = useLangue();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${large ? "lg:col-span-2" : ""} ${isDragging ? "z-10 opacity-80 shadow-2xl" : ""} flex min-w-0 items-center gap-3 rounded-carte border border-dashed border-accent/50 bg-surface px-3 py-3`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t(`Déplacer « ${TITRES[id].fr} »`, `Move “${TITRES[id].en}”`)}
        className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg bg-surface-2 text-attenue hover:text-texte active:cursor-grabbing"
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
          {[5, 10, 15].flatMap((y) => [7, 13].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
        </svg>
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{t(TITRES[id].fr, TITRES[id].en)}</span>
      <Bouton onClick={onLargeur} actif={large} titre={t("Pleine largeur sur grand écran", "Full width on large screens")}>
        {large ? t("Large", "Wide") : t("Normal", "Normal")}
      </Bouton>
      <Bouton onClick={onMasquer} titre={t("Masquer ce widget", "Hide this widget")}>
        {t("Masquer", "Hide")}
      </Bouton>
    </div>
  );
}

export interface Widget {
  id: IdWidget;
  contenu: ReactNode;
}

// Tableau de bord : widgets déplaçables (souris, tactile, clavier), masquables et
// élargissables ; la disposition est enregistrée pour le compte de l'utilisateur.
export function Tableau({ widgets, disposition: initiale }: { widgets: Widget[]; disposition: Disposition }) {
  const { t } = useLangue();
  const [disposition, setDisposition] = useState(initiale);
  const [edition, setEdition] = useState(false);
  const [, demarrer] = useTransition();
  const capteurs = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const contenus = new Map(widgets.map((w) => [w.id, w.contenu]));
  const visibles = disposition.ordre.filter((id) => contenus.has(id) && !disposition.masques.includes(id));
  const masques = disposition.ordre.filter((id) => contenus.has(id) && disposition.masques.includes(id));

  const enregistrer = (suivante: Disposition | null) => {
    setDisposition(suivante ?? DISPOSITION_DEFAUT);
    demarrer(async () => {
      await choisirDisposition(suivante);
    });
  };

  const deplacer = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const de = disposition.ordre.indexOf(active.id as IdWidget);
    const vers = disposition.ordre.indexOf(over.id as IdWidget);
    enregistrer({ ...disposition, ordre: arrayMove(disposition.ordre, de, vers) });
  };
  const basculer = (liste: "masques" | "larges", id: IdWidget) =>
    enregistrer({
      ...disposition,
      [liste]: disposition[liste].includes(id) ? disposition[liste].filter((x) => x !== id) : [...disposition[liste], id],
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {edition && (
          <>
            <p className="mr-auto text-xs text-attenue">
              {t(
                "Glissez les widgets par leur poignée (ou flèches du clavier après Espace). Les changements sont enregistrés pour votre compte.",
                "Drag widgets by their handle (or arrow keys after Space). Changes are saved to your account.",
              )}
            </p>
            <Bouton onClick={() => enregistrer(null)}>{t("Disposition par défaut", "Default layout")}</Bouton>
          </>
        )}
        <Bouton onClick={() => setEdition((e) => !e)} actif={edition}>
          {edition ? t("Terminer", "Done") : t("Personnaliser le tableau", "Customize dashboard")}
        </Bouton>
      </div>

      {edition && masques.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-bordure bg-surface px-3 py-2 text-xs text-attenue">
          <span>{t("Masqués :", "Hidden:")}</span>
          {masques.map((id) => (
            <Bouton key={id} onClick={() => basculer("masques", id)} titre={t("Afficher", "Show")}>
              + {t(TITRES[id].fr, TITRES[id].en)}
            </Bouton>
          ))}
        </div>
      )}

      {edition ? (
        <DndContext sensors={capteurs} collisionDetection={closestCenter} onDragEnd={deplacer}>
          <SortableContext items={visibles} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {visibles.map((id) => (
                <TuileEdition
                  key={id}
                  id={id}
                  large={disposition.larges.includes(id)}
                  onLargeur={() => basculer("larges", id)}
                  onMasquer={() => basculer("masques", id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {visibles.map((id) => (
            <div key={id} id={`widget-${id}`} className={`min-w-0 scroll-mt-20 ${disposition.larges.includes(id) ? "lg:col-span-2" : ""}`}>
              {contenus.get(id)}
            </div>
          ))}
          {visibles.length === 0 && (
            <p className="rounded-xl bg-surface p-4 text-sm text-attenue lg:col-span-2">
              {t("Tous les widgets sont masqués : « Personnaliser le tableau » pour en afficher.", "All widgets are hidden: use “Customize dashboard” to show some.")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
