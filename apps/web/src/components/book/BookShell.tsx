import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import type { SpreadId } from "../../lib/spreads";

type BookShellProps = {
  page: SpreadId | "cover";
  direction: number;
  left?: ReactNode;
  right?: ReactNode;
  full?: ReactNode;
};

const variants = {
  enter: (direction: number) => ({
    rotateY: direction >= 0 ? -18 : 18,
    opacity: 0,
    x: direction >= 0 ? 36 : -36,
  }),
  center: {
    rotateY: 0,
    opacity: 1,
    x: 0,
  },
  exit: (direction: number) => ({
    rotateY: direction >= 0 ? 18 : -18,
    opacity: 0,
    x: direction >= 0 ? -36 : 36,
  }),
};

export function BookShell({ page, direction, left, right, full }: BookShellProps) {
  return (
    <div className="book-frame">
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={page}
          className={`book-spread${full ? " cover" : ""}`}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformPerspective: 1200, transformStyle: "preserve-3d" }}
        >
          {full ? (
            full
          ) : (
            <>
              {left}
              {right}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
