import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { verifyAccessKey } from "../../lib/api";

type LockState = "locked" | "unlocking" | "open";

type AccessGateProps = {
  initialKey?: string;
  onSuccess: (accessKey: string) => void;
};

function PadlockIcon({ open, reduceMotion }: { open: boolean; reduceMotion: boolean }) {
  return (
    <svg
      className="padlock-svg"
      data-open={open}
      viewBox="0 0 64 80"
      width="58"
      height="72"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lockBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8c976" />
          <stop offset="45%" stopColor="#c9a24d" />
          <stop offset="100%" stopColor="#8f6f2e" />
        </linearGradient>
        <linearGradient id="lockShackle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d9d9d2" />
          <stop offset="50%" stopColor="#f5f5ef" />
          <stop offset="100%" stopColor="#a8a89e" />
        </linearGradient>
      </defs>
      {/* shackle */}
      <motion.path
        d="M18 38 V24 C18 14 24 8 32 8 C40 8 46 14 46 24 V38"
        fill="none"
        stroke="url(#lockShackle)"
        strokeWidth="7"
        strokeLinecap="round"
        initial={false}
        animate={
          open
            ? {
                rotate: -28,
                y: -7,
                x: -3,
                transition: { duration: reduceMotion ? 0.01 : 0.45, ease: "backOut" },
              }
            : { rotate: 0, y: 0, x: 0 }
        }
        style={{ transformOrigin: "18px 38px" }}
      />
      {/* body */}
      <rect x="10" y="36" width="44" height="34" rx="7" fill="url(#lockBody)" />
      <rect x="10" y="36" width="44" height="10" rx="7" fill="rgba(255,255,255,0.18)" />
      {/* keyhole */}
      <circle cx="32" cy="50" r="4.6" fill="#4a3813" />
      <rect x="29.8" y="52" width="4.4" height="9" rx="2.2" fill="#4a3813" />
    </svg>
  );
}

export function AccessGate({ initialKey = "", onSuccess }: AccessGateProps) {
  const [accessKey, setAccessKey] = useState(initialKey);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockState, setLockState] = useState<LockState>("locked");
  const [shake, setShake] = useState(0);
  const reduceMotion = useReducedMotion();
  const [isNarrow, setIsNarrow] = useState(() =>
    window.matchMedia("(max-width: 600px)").matches,
  );
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)");
    const update = () => setIsNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading || lockState !== "locked") return;
    setError("");
    setLoading(true);
    try {
      const key = accessKey.trim();
      await verifyAccessKey(key);
      setLockState("unlocking");
      const unlockDelay = reduceMotion ? 40 : 620;
      const handoffDelay = reduceMotion ? 100 : 1750;
      timers.current.push(
        window.setTimeout(() => setLockState("open"), unlockDelay),
        window.setTimeout(() => onSuccess(key), handoffDelay),
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "request_failed";
      setError(
        message === "unauthorized"
          ? "密码不对，书房还锁着呢。"
          : "暂时无法连接服务，请稍后重试。",
      );
      setShake((n) => n + 1);
      setLoading(false);
    }
  }

  const covered = lockState !== "open";

  return (
    <div className="gate-scene">
      <div className="gate-stage" data-lock-state={lockState} data-shake-count={shake}>
        <motion.div
          className="gate-book"
          initial={reduceMotion ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* pages block (visible when cover opens) */}
          <div className="gate-book-pages">
            <div className="gate-firstpage">
              <p className="gate-firstpage-eyebrow">Private library</p>
              <h2>任务书架</h2>
              <p className="gate-firstpage-line">正在打开书房…</p>
            </div>
          </div>

          {/* cover */}
          <motion.div
            className="gate-book-cover"
            initial={false}
            animate={
              covered
                ? { rotateY: 0 }
                : {
                    rotateY: isNarrow ? -112 : -138,
                    transition: {
                      duration: reduceMotion ? 0.01 : 1.05,
                      ease: [0.6, 0.05, 0.18, 1],
                    },
                  }
            }
          >
            <div className="gate-cover-face">
              <div className="gate-cover-frame">
                <p className="gate-cover-eyebrow">Private study</p>
                <h1 className="gate-cover-title">私人书房</h1>
                <motion.div
                  className="gate-lock"
                  key={shake}
                  animate={shake && !reduceMotion ? { x: [0, -7, 7, -5, 5, 0] } : {}}
                  transition={{ duration: reduceMotion ? 0.01 : 0.4 }}
                >
                  <PadlockIcon
                    open={lockState !== "locked"}
                    reduceMotion={Boolean(reduceMotion)}
                  />
                </motion.div>
                <p className="gate-cover-hint">
                  {lockState === "locked" ? "书房已上锁" : "验证成功"}
                </p>
                <motion.form
                  className="gate-form"
                  onSubmit={handleSubmit}
                  animate={
                    lockState === "locked"
                      ? { opacity: 1, y: 0 }
                      : { opacity: 0, y: 6, pointerEvents: "none" as const }
                  }
                  transition={{ duration: reduceMotion ? 0.01 : 0.3 }}
                >
                  <input
                    type="password"
                    value={accessKey}
                    onChange={(event) => setAccessKey(event.target.value)}
                    placeholder="输入书房密码"
                    aria-label="访问密钥"
                    aria-describedby={error ? "gate-error" : undefined}
                    aria-invalid={Boolean(error)}
                    autoFocus
                    required
                  />
                  <button type="submit" disabled={loading || !accessKey.trim()}>
                    {loading ? "验证中…" : "进入书房"}
                  </button>
                  {error ? (
                    <p id="gate-error" className="gate-error" role="alert">
                      {error}
                    </p>
                  ) : null}
                </motion.form>
              </div>
            </div>
            <div className="gate-cover-back" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
