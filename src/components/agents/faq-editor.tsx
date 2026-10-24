'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button, Field, Input, Textarea } from '@/components/ui';

export interface FaqItem {
  question: string;
  answer: string;
}

export function FaqEditor({
  value,
  onChange,
  max = 25,
  label = 'Frequently asked questions',
  hint = 'Agents answer only from these entries and your workspace facts.',
}: {
  value: FaqItem[];
  onChange: (next: FaqItem[]) => void;
  max?: number;
  label?: string;
  hint?: string;
}) {
  function update(index: number, patch: Partial<FaqItem>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function add() {
    if (value.length >= max) return;
    onChange([...value, { question: '', answer: '' }]);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-700">{label}</span>
        <Button type="button" variant="secondary" small onClick={add} disabled={value.length >= max}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add question
        </Button>
      </div>

      {value.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-canvas/60 px-4 py-6 text-center text-[13px] text-muted">
          No questions yet. Add the questions your callers ask most, with the exact approved answer.
        </div>
      ) : (
        <div className="space-y-3">
          {value.map((item, index) => (
            <div key={index} className="rounded-xl border border-line bg-white p-3.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <Field label={`Question ${index + 1}`} htmlFor={`faq-q-${index}`}>
                    <Input
                      id={`faq-q-${index}`}
                      value={item.question}
                      maxLength={300}
                      placeholder="Do you offer weekend appointments?"
                      onChange={(event) => update(index, { question: event.target.value })}
                    />
                  </Field>
                  <Field label="Approved answer" htmlFor={`faq-a-${index}`}>
                    <Textarea
                      id={`faq-a-${index}`}
                      value={item.answer}
                      maxLength={2000}
                      className="min-h-[70px]"
                      placeholder="Yes — Saturdays from 9am to 1pm, by appointment only."
                      onChange={(event) => update(index, { answer: event.target.value })}
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="mt-6 rounded-lg p-2 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove question ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="hint">{hint}</p>
    </div>
  );
}
