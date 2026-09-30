import { publicVisibilityAction } from "@/app/actions/map";
import { publicMapApprovalBlocker } from "@/lib/geo";

type CaseForMap = {
  id: string;
  title: string;
  district: string | null;
  publicTitle: string | null;
  publicArea: string | null;
  publicVisible: boolean;
  status: string;
  latitude: number | null;
  longitude: number | null;
};

const guidance = {
  location_required: "A recorded issue pin is required for public map approval. This report remains valid without a pin. A separately approved Before & After story can still be published without a map marker. Do not guess coordinates or use a district centre.",
  invalid_location: "The recorded pin is outside the supported Karachi map area. Review the location before approving a public marker.",
  status_required: "Verify this complaint before approving it for the public map.",
};

export function PublicMapApproval({ complaint }: { complaint: CaseForMap }) {
  const blocker = publicMapApprovalBlocker(complaint);
  return <div>
    <h3 className="font-bold">Public map approval</h3>
    <p className="mt-2 text-sm">{complaint.publicVisible ? "Approved with an approximate marker." : "Private and hidden from the map."}</p>
    {!complaint.publicVisible && blocker && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">{guidance[blocker]}</p>}
    {(complaint.publicVisible || !blocker) && <form action={publicVisibilityAction} className="mt-3 space-y-3">
      <input type="hidden" name="complaintId" value={complaint.id} />
      {!complaint.publicVisible && <>
        <label className="block"><span className="field-label">Safe public title</span><input name="publicTitle" className="field-input" defaultValue={complaint.publicTitle ?? complaint.title} minLength={5} maxLength={120} required /></label>
        <label className="block"><span className="field-label">Approximate public area</span><input name="publicArea" className="field-input" defaultValue={complaint.publicArea ?? complaint.district ?? ""} minLength={2} maxLength={80} required /></label>
      </>}
      <button type="submit" name="visible" value={complaint.publicVisible ? "0" : "1"} className="btn-dark cursor-pointer">{complaint.publicVisible ? "Remove from public map" : "Approve verified case for public map"}</button>
    </form>}
    <p className="mt-2 text-xs text-slate-500">Private coordinates: {complaint.latitude != null && complaint.longitude != null ? `${complaint.latitude.toFixed(5)}, ${complaint.longitude.toFixed(5)}` : "Not recorded"}. Exact coordinates are never public.</p>
  </div>;
}
