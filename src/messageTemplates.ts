/**
 * Modeles de messages : reponses pre-ecrites que l'admin insere en un clic dans
 * "message libre au client" (Mini App), puis ajuste avant d'envoyer.
 */
import { db } from './db';

export interface MessageTemplate {
  id: number;
  label: string;
  content: string;
  position: number;
}

const q = {
  list: db.prepare('SELECT * FROM message_templates ORDER BY position, id'),
  get: db.prepare<[number]>('SELECT * FROM message_templates WHERE id = ?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM message_templates'),
  insert: db.prepare<[string, string, number]>(
    'INSERT INTO message_templates (label, content, position) VALUES (?, ?, ?)',
  ),
  update: db.prepare<{ id: number; label: string; content: string; position: number }>(
    'UPDATE message_templates SET label = @label, content = @content, position = @position WHERE id = @id',
  ),
  remove: db.prepare<[number]>('DELETE FROM message_templates WHERE id = ?'),
};

const DEFAULTS: Array<Omit<MessageTemplate, 'id' | 'position'>> = [
  { label: 'On arrive', content: '🛵 On arrive dans une dizaine de minutes !' },
  { label: 'Leger retard', content: '⏳ Leger retard sur la livraison, desole. On arrive des que possible.' },
  {
    label: 'Rupture / remplacement',
    content:
      "Un produit de ta commande est en rupture. On peut le remplacer par un equivalent, ca te va ?",
  },
  {
    label: 'Adresse a preciser',
    content: "Le livreur ne trouve pas l'adresse. Peux-tu preciser (etage, code d'acces, batiment) ?",
  },
];

export function seedMessageTemplatesIfEmpty(): void {
  if ((q.count.get() as { n: number }).n > 0) return;
  DEFAULTS.forEach((t, i) => q.insert.run(t.label, t.content, i));
  console.log(`[messages] ${DEFAULTS.length} modeles de messages par defaut crees.`);
}

export function listMessageTemplates(): MessageTemplate[] {
  return q.list.all() as MessageTemplate[];
}

export function createMessageTemplate(input: { label: string; content: string }): MessageTemplate {
  const position = (q.list.all() as MessageTemplate[]).length;
  const id = Number(q.insert.run(input.label, input.content, position).lastInsertRowid);
  return q.get.get(id) as MessageTemplate;
}

export function updateMessageTemplate(
  id: number,
  patch: Partial<Omit<MessageTemplate, 'id'>>,
): MessageTemplate | null {
  const current = q.get.get(id) as MessageTemplate | undefined;
  if (!current) return null;
  q.update.run({
    id,
    label: patch.label ?? current.label,
    content: patch.content ?? current.content,
    position: patch.position ?? current.position,
  });
  return q.get.get(id) as MessageTemplate;
}

export function deleteMessageTemplate(id: number): boolean {
  return q.remove.run(id).changes > 0;
}
