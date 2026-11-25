// What a confirmation dialog shows. The words are made by plain functions (resetTexts.ts, importFlow.ts) and tested as data.
export interface SlotOption {
  slot: number;
  label: string;
  /** The setup this slot holds now: choosing it replaces that setup. */
  replaces?: string;
}

export interface ConfirmSpec {
  title: string;
  /** Paragraphs; the first names what is lost. */
  body: string[];
  /** A list under the paragraphs (the fields a refusal names); it scrolls when long. */
  list?: string[];
  /** The main button; `null` makes it an information box with a single Close button. */
  confirmLabel: string | null;
  /** A third choice beside Cancel and the main button ("Export first"); it closes the dialog, then runs. */
  secondary?: { label: string; run: () => void };
  /** A slot picker; `run` then gets the chosen slot. */
  slots?: { options: SlotOption[]; initial: number };
  run: (slot?: number) => void;
}
