import { X } from "lucide-react";
import { Link } from "react-router-dom";
import { useRealtime } from "../context/RealtimeContext";

export function Toasts() {
  const { toasts, dismissToast } = useRealtime();

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id}>
          {toast.link ? <Link to={toast.link}>{toast.message}</Link> : <span>{toast.message}</span>}
          <button type="button" aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
            <X aria-hidden size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}
