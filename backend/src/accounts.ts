import { Router } from 'express';
import { randomInt, createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from './db.js';
import { auth, roles, fail } from './middleware.js';

export const accountRouter = Router();
accountRouter.use(auth);

const createAccountSchema = z.object({ currency: z.literal('INR').optional() }).strict();
const keyPattern = /^[\x21-\x7E]{16,128}$/;
const accountFingerprint = createHash('sha256')
  .update(JSON.stringify({ operation: 'ACCOUNT_CREATE', currency: 'INR' }))
  .digest('hex');

accountRouter.post('/', roles('CUSTOMER'), async (req, res) => {
  const body = createAccountSchema.safeParse(req.body ?? {});
  if (!body.success) {
    return fail(res, 'VALIDATION_ERROR', 'Only INR account creation is supported; owner and opening balance are server controlled', 400, req.correlationId);
  }

  const key = String(req.headers['idempotency-key'] || '');
  if (!keyPattern.test(key)) {
    return fail(res, 'VALIDATION_ERROR', 'Idempotency-Key must contain 16–128 printable characters', 400, req.correlationId);
  }

  const principalId = req.principal!.id;

  // A client retry must reuse its key. Different keys intentionally allow
  // the same customer to create multiple legitimate accounts.
  const replayExisting = async () => {
    const prior = await prisma.idempotencyRecord.findUnique({
      where: { principalId_operation_key: { principalId, operation: 'ACCOUNT_CREATE', key } }
    });
    if (!prior) return null;
    if (prior.fingerprint !== accountFingerprint) {
      return { conflict: true as const };
    }
    return { conflict: false as const, status: prior.httpStatus || 201, response: prior.response };
  };

  const existing = await replayExisting();
  if (existing?.conflict) {
    return fail(res, 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH', 'This idempotency key was already used for a different request', 409, req.correlationId);
  }
  if (existing) {
    return res.status(existing.status).json({ ...(existing.response as object), idempotentReplay: true, correlationId: req.correlationId });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const accountNumber = 'LL' + Array.from({ length: 12 }, () => randomInt(0, 10)).join('');
    try {
      const response = await prisma.$transaction(async tx => {
        const reservation = await tx.idempotencyRecord.create({
          data: {
            principalId,
            operation: 'ACCOUNT_CREATE',
            key,
            fingerprint: accountFingerprint,
            status: 'RESERVED'
          }
        });

        const account = await tx.account.create({
          data: { ownerUserId: principalId, accountNumber, currency: 'INR' }
        });
        await tx.ledgerAccount.create({
          data: { accountId: account.id, normalSide: 'CREDIT', currency: 'INR' }
        });
        await tx.auditLog.create({
          data: {
            actorUserId: principalId,
            action: 'ACCOUNT_CREATED',
            targetType: 'ACCOUNT',
            targetId: account.id,
            metadata: { accountNumber: account.accountNumber },
            correlationId: req.correlationId
          }
        });

        const result = {
          success: true,
          data: {
            id: account.id,
            accountNumber: account.accountNumber,
            currency: account.currency,
            status: account.status,
            balanceMinor: '0',
            accountHolderName: req.principal!.name,
            createdAt: account.createdAt.toISOString()
          }
        };
        await tx.idempotencyRecord.update({
          where: { id: reservation.id },
          data: { status: 'POSTED', response: result, httpStatus: 201 }
        });
        return result;
      });
      return res.status(201).json({ ...response, idempotentReplay: false, correlationId: req.correlationId });
    } catch (error: any) {
      // Concurrent requests using the same key race on the unique
      // (principal, operation, key) constraint. Reload and replay the winner.
      if (error?.code === 'P2002') {
        const prior = await replayExisting();
        if (prior?.conflict) {
          return fail(res, 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH', 'This idempotency key was already used for a different request', 409, req.correlationId);
        }
        if (prior) {
          return res.status(prior.status).json({ ...(prior.response as object), idempotentReplay: true, correlationId: req.correlationId });
        }
        // No idempotency row means the account number itself collided; retry.
        if (attempt < 4) continue;
      }
      throw error;
    }
  }

  return fail(res, 'ACCOUNT_NUMBER_GENERATION_FAILED', 'Could not generate a unique account number. Please retry.', 503, req.correlationId);
});

accountRouter.get('/', roles('CUSTOMER'), async (req, res) => {
  const rows = await prisma.account.findMany({
    where: { ownerUserId: req.principal!.id },
    orderBy: { createdAt: 'desc' }
  });
  res.json({
    success: true,
    data: rows.map(a => ({ ...a, balanceMinor: a.balanceMinor.toString(), accountHolderName: req.principal!.name }))
  });
});

// Minimal receiver discovery: callers receive only the account UUID and masked holder name.
accountRouter.get('/lookup', async (req, res) => {
  const number = String(req.query.accountNumber || '').trim();
  if (!/^LL\d{12}$/.test(number)) return fail(res, 'VALIDATION_ERROR', 'Enter a valid LedgerLine account number', 400, req.correlationId);
  const a = await prisma.account.findUnique({ where: { accountNumber: number }, include: { owner: true } });
  if (!a || a.status !== 'ACTIVE') return fail(res, 'NOT_FOUND', 'Eligible account not found', 404, req.correlationId);
  const parts = a.owner.name.split(' ');
  const masked = parts.map((p, i) => i === 0 ? p[0] + '•'.repeat(Math.max(1, p.length - 1)) : p[0] + '.').join(' ');
  res.json({ success: true, data: { accountId: a.id, accountNumber: a.accountNumber, maskedAccountHolderName: masked, currency: a.currency } });
});

accountRouter.get('/:accountId/balance', async (req, res) => {
  const a = await prisma.account.findUnique({ where: { id: req.params.accountId }, include: { owner: true } });
  if (!a) return fail(res, 'NOT_FOUND', 'Account not found', 404, req.correlationId);
  if (req.principal!.role !== 'ADMIN' && a.ownerUserId !== req.principal!.id) return fail(res, 'NOT_FOUND', 'Account not found', 404, req.correlationId);
  res.json({ success: true, data: { accountId: a.id, balanceMinor: a.balanceMinor.toString(), currency: a.currency } });
});

accountRouter.get('/:accountId', async (req, res) => {
  const a = await prisma.account.findUnique({ where: { id: req.params.accountId }, include: { owner: true } });
  if (!a) return fail(res, 'NOT_FOUND', 'Account not found', 404, req.correlationId);
  if (req.principal!.role !== 'ADMIN' && a.ownerUserId !== req.principal!.id) return fail(res, 'NOT_FOUND', 'Account not found', 404, req.correlationId);
  res.json({ success: true, data: { id: a.id, accountNumber: a.accountNumber, accountHolderName: a.owner.name, currency: a.currency, status: a.status, balanceMinor: a.balanceMinor.toString(), createdAt: a.createdAt } });
});
