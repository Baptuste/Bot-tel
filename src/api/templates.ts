/**
 * API modeles de messages pour la Mini App admin.
 */
import { Router } from 'express';
import {
  createMessageTemplate,
  deleteMessageTemplate,
  listMessageTemplates,
  updateMessageTemplate,
  type MessageTemplate,
} from '../messageTemplates';
import { requireAdmin } from './auth';

const MAX_LEN = 2000;

export function templatesRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', (_req, res) => {
    res.json({ templates: listMessageTemplates() });
  });

  router.post('/', (req, res) => {
    const label = String(req.body?.label ?? '').trim();
    const content = String(req.body?.content ?? '').trim();
    if (!label || !content || content.length > MAX_LEN) {
      res.status(400).json({ error: 'invalid_template' });
      return;
    }
    res.status(201).json({ template: createMessageTemplate({ label, content }) });
  });

  router.patch('/:id', (req, res) => {
    const patch: Partial<Omit<MessageTemplate, 'id'>> = {};
    if (req.body?.label !== undefined) patch.label = String(req.body.label).trim();
    if (req.body?.content !== undefined) patch.content = String(req.body.content).trim();
    if (req.body?.position !== undefined) patch.position = Number(req.body.position);
    if (patch.content !== undefined && (patch.content.length === 0 || patch.content.length > MAX_LEN)) {
      res.status(400).json({ error: 'invalid_content' });
      return;
    }

    const template = updateMessageTemplate(Number(req.params.id), patch);
    if (!template) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ template });
  });

  router.delete('/:id', (req, res) => {
    res.json({ ok: deleteMessageTemplate(Number(req.params.id)) });
  });

  return router;
}
