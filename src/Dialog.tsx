import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const invoker = document.activeElement as HTMLElement;
    const dialog = ref.current!;
    dialog.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      close();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.close();
      invoker?.focus();
    };
  }, [close]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="dialog-body">
        <header className="dialog-head">
          <h2 id="dialog-title">{title}</h2>
          <button className="icon-button" aria-label="Закрыть" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
