import { useEffect, useState } from 'react';
import { api } from './api';
import { alertDialog, confirmDialog } from './telegram';
import type { MessageTemplate } from './types';

interface Props {
  /** Appelé quand on choisit un modèle : insère son contenu dans le champ message. */
  onPick: (content: string) => void;
}

export function MessageTemplates({ onPick }: Props) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [manage, setManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newContent, setNewContent] = useState('');

  async function load() {
    try {
      setTemplates((await api.templates.list()).templates);
    } catch {
      /* silencieux : la zone message reste utilisable sans modèles */
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      alertDialog(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="templates">
      <div className="template-chips">
        {templates.map((t) => (
          <button key={t.id} className="chip" onClick={() => onPick(t.content)} title={t.content}>
            {t.label}
          </button>
        ))}
        <button className="chip" onClick={() => setManage((v) => !v)}>
          {manage ? 'Fermer' : '⚙️ Modèles'}
        </button>
      </div>

      {manage && (
        <div className="template-manage">
          {templates.map((t) => (
            <TemplateEditor
              key={t.id}
              template={t}
              busy={busy}
              onSave={(label, content) => run(() => api.templates.update(t.id, { label, content }))}
              onDelete={async () => {
                if (await confirmDialog(`Supprimer le modèle "${t.label}" ?`)) {
                  await run(() => api.templates.remove(t.id));
                }
              }}
            />
          ))}

          <div className="template-new">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nom (ex : On arrive)" />
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Contenu du message"
            />
            <button
              className="btn secondary"
              disabled={busy || !newLabel.trim() || !newContent.trim()}
              onClick={() =>
                void run(async () => {
                  await api.templates.create(newLabel.trim(), newContent.trim());
                  setNewLabel('');
                  setNewContent('');
                })
              }
            >
              Ajouter le modèle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  busy,
  onSave,
  onDelete,
}: {
  template: MessageTemplate;
  busy: boolean;
  onSave: (label: string, content: string) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(template.label);
  const [content, setContent] = useState(template.content);
  const dirty = label !== template.label || content !== template.content;

  return (
    <div className="template-edit">
      <input value={label} onChange={(e) => setLabel(e.target.value)} />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="template-edit-actions">
        <button className="mini" disabled={busy || !dirty || !label.trim() || !content.trim()} onClick={() => onSave(label.trim(), content.trim())}>
          Enregistrer
        </button>
        <button className="mini danger" disabled={busy} onClick={onDelete}>
          Suppr.
        </button>
      </div>
    </div>
  );
}
