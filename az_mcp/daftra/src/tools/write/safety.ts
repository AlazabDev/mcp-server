/**
 * ═══════════════════════════════════════════════════════════════
 * 🛡️ Safety Layer — حماية متعددة المستويات لعمليات الكتابة
 * ═══════════════════════════════════════════════════════════════
 *
 * المستويات:
 *   1. ENABLE_WRITE_TOOLS  → مفتاح عام (افتراضي: false)
 *   2. DRY_RUN             → تجربة بدون تنفيذ
 *   3. CONFIRM_PHRASE      → عبارة تأكيد إلزامية
 *   4. Audit Log           → تسجيل كل عملية
 *   5. Rate Limiter        → منع الإغراق
 */

import fs from "node:fs";
import path from "node:path";

export interface SafetyConfig {
  enabled: boolean;
  dryRun: boolean;
  confirmPhrase: string;
  auditPath: string;
  rateLimitPerMinute: number;
}

export interface GuardResult {
  ok: boolean;
  message?: string;
  dryRun?: boolean;
}

export interface SafetyInfo {
  write_enabled: boolean;
  dry_run: boolean;
  rate_limit: string;
  confirm_required: boolean;
  confirm_phrase_hint: string;
}

const CONFIG: SafetyConfig = {
  enabled: process.env.ENABLE_WRITE_TOOLS === "true",
  dryRun: process.env.DRY_RUN === "true",
  confirmPhrase: process.env.WRITE_CONFIRM_PHRASE || "CONFIRM_WRITE",
  auditPath: process.env.AUDIT_LOG_PATH || "./logs/audit.log",
  rateLimitPerMinute: parseInt(process.env.WRITE_RATE_LIMIT || "30", 10),
};

const state = {
  writeCount: 0,
  windowStart: Date.now(),
};

function checkRateLimit(): void {
  const now = Date.now();
  if (now - state.windowStart > 60_000) {
    state.windowStart = now;
    state.writeCount = 0;
  }
  state.writeCount++;
  if (state.writeCount > CONFIG.rateLimitPerMinute) {
    throw new Error(
      `🚫 تجاوز الحد المسموح: ${CONFIG.rateLimitPerMinute} عملية/دقيقة`
    );
  }
}

function auditLog(entry: Record<string, unknown>): void {
  try {
    const dir = path.dirname(CONFIG.auditPath);
    fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      pid: process.pid,
      ...entry,
    });
    fs.appendFileSync(CONFIG.auditPath, line + "\n", "utf-8");
  } catch (e) {
    console.error("⚠️ فشل تسجيل التدقيق:", (e as Error).message);
  }
}

/**
 * الحارس الرئيسي — يُستدعى قبل كل عملية كتابة
 */
export function guard(
  action: string,
  args: Record<string, unknown>,
  confirmToken?: string
): GuardResult {
  if (!CONFIG.enabled) {
    return {
      ok: false,
      message:
        "🔒 أدوات الكتابة معطّلة. اضبط ENABLE_WRITE_TOOLS=true في البيئة.",
    };
  }

  try {
    checkRateLimit();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  if (!CONFIG.dryRun && confirmToken !== CONFIG.confirmPhrase) {
    return {
      ok: false,
      message:
        `🔐 عملية كتابة — تتطلّب تأكيداً.\n` +
        `أرسل confirm_token="${CONFIG.confirmPhrase}"\n` +
        `مثال: { ..., "confirm_token": "${CONFIG.confirmPhrase}" }`,
    };
  }

  auditLog({ action, args, mode: CONFIG.dryRun ? "dry-run" : "live" });

  if (CONFIG.dryRun) {
    return {
      ok: true,
      dryRun: true,
      message: "🧪 وضع المحاكاة مفعّل — لم يُرسَل أي تغيير إلى Daftra.",
    };
  }

  return { ok: true };
}

export function safetyInfo(): SafetyInfo {
  return {
    write_enabled: CONFIG.enabled,
    dry_run: CONFIG.dryRun,
    rate_limit: `${CONFIG.rateLimitPerMinute}/min`,
    confirm_required: !CONFIG.dryRun,
    confirm_phrase_hint: CONFIG.dryRun
      ? "(not needed in dry-run)"
      : `send confirm_token="${CONFIG.confirmPhrase}"`,
  };
}