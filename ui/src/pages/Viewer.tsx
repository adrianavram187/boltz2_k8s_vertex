import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, EyeOff } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

export default function Viewer() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const pluginInstanceRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId || !viewerContainerRef.current) return;

    let isMounted = true;
    const fetchAndRender = async () => {
      try {
        const baseUrl = API_BASE_URL.replace(/\/$/, "");
        const cifUrl = `${baseUrl}/jobs/${jobId}/cif`;

        // 1. Verify we can get the CIF file (throws error if not found)
        const response = await fetch(cifUrl);
        if (!response.ok) {
          throw new Error("CIF file not found or still processing.");
        }

        if (!isMounted) return;

        // 2. Initialize PDBe Molstar Viewer
        // @ts-ignore
        if (window.PDBeMolstarPlugin) {
          // @ts-ignore
          const plugin = new window.PDBeMolstarPlugin();
          pluginInstanceRef.current = plugin;

          const options = {
            customData: {
              url: cifUrl,
              format: "cif",
            },
            hideControls: true,
            bgColor: { r: 255, g: 255, b: 255 },
            lighting: 'glossy',
            hideCanvasControls: ["selection", "animation", "controlToggle", "controlInfo"],
          };

          plugin.render(viewerContainerRef.current, options);
        } else {
          throw new Error("Molstar plugin failed to load from CDN.");
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || "Failed to load 3D structure");
      }
    };

    fetchAndRender();

    return () => {
      isMounted = false;
      if (pluginInstanceRef.current) {
        try {
          if (viewerContainerRef.current) {
             viewerContainerRef.current.innerHTML = '';
          }
        } catch (e) {
          console.error("Cleanup error", e);
        }
      }
    };
  }, [jobId]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-900"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">3D Structure Viewer</h1>
            <p className="text-xs text-gray-500 font-mono">Job: {jobId}</p>
          </div>
        </div>

        <a
          href={`${API_BASE_URL.replace(/\/$/, "")}/jobs/${jobId}/cif`}
          download={`job_${jobId}.cif`}
          className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg text-sm shadow-sm transition-all"
        >
          <Download className="w-4 h-4" />
          Download CIF
        </a>
      </header>

      <main className="flex-1 relative bg-white m-6 rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
            <EyeOff className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">Structure Unavailable</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={() => navigate("/")}
              className="mt-6 text-gsk-orange hover:underline text-sm font-medium"
            >
              Return Home
            </button>
          </div>
        ) : (
          <div
            ref={viewerContainerRef}
            className="absolute inset-0 w-full h-full"
            style={{ position: 'relative' }}
          />
        )}
      </main>
    </div>
  );
}
