import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const statusConfig: Record<string, { label: string; className: string; pulse?: boolean }> = {
  uploading:  { label: "Uploading",  className: "bg-gray-100 text-gray-700 border-gray-200" },
  uploaded:   { label: "Uploaded",   className: "bg-gray-100 text-gray-700 border-gray-200" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-700 border-blue-200", pulse: true },
  extracted:  { label: "Extracted",  className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  review:     { label: "Review",     className: "bg-amber-100 text-amber-700 border-amber-200" },
  approved:   { label: "Approved",   className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rejected:   { label: "Rejected",   className: "bg-red-100 text-red-700 border-red-200" },
  failed:     { label: "Failed",     className: "bg-red-100 text-red-700 border-red-200" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? { label: status, className: "" };
  return (
    <Badge variant="outline" className={cn("gap-1", cfg.className)}>
      {cfg.pulse && <Loader2 className="h-3 w-3 animate-spin" />}
      {cfg.label}
    </Badge>
  );
}
