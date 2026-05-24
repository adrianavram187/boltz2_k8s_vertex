import React, { useState, useEffect, useCallback } from "react";
import { UploadCloud, Activity, CheckCircle, Clock, XCircle, RefreshCw, List, Eye, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import YamlConfigForm from "../components/YamlConfigForm";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

interface JobItem {
  job_id: string;
  model_name: string;
  status: string;
  creation_time: string | null;
}

interface JobListResponse {
  jobs: JobItem[];
  next_page_token: string | null;
  has_more: boolean;
  total_count: number | null;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [pageSize] = useState(10);
  const [currentPageToken, setCurrentPageToken] = useState<string | null>(null);
  const [pageTokenStack, setPageTokenStack] = useState<string[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [submissionMode, setSubmissionMode] = useState<"fasta" | "yaml">("fasta");
  
  const navigate = useNavigate();

  const fetchJobs = useCallback(
    async (pageToken: string | null = null) => {
      try {
        setIsLoadingJobs(true);
        const baseUrl = API_BASE_URL.replace(/\/$/, "");
        const params = new URLSearchParams();
        params.set("page_size", String(pageSize));
        if (pageToken) {
          params.set("page_token", pageToken);
        }
        const res = await fetch(`${baseUrl}/jobs?${params.toString()}`);
        if (res.ok) {
          const data: JobListResponse = await res.json();
          setJobs(data.jobs || []);
          setNextPageToken(data.next_page_token);
          setHasMore(data.has_more);
          setTotalCount(data.total_count);
        }
      } catch (err) {
        console.error("Failed to fetch jobs list", err);
      } finally {
        setIsLoadingJobs(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    fetchJobs(null);
  }, [fetchJobs]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadAndRun = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setJobId(null);
    setJobStatus(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const baseUrl = API_BASE_URL.replace(/\/$/, "");

      const uploadRes = await fetch(`${baseUrl}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.detail || "File upload failed");
      }

      const uploadData = await uploadRes.json();
      const uploadedFilename = uploadData.filename;

      const predictRes = await fetch(`${baseUrl}/predict-vertex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_name: "boltz-2",
          input_file: uploadedFilename, // Pass the EXACT generated prefix back
        }),
      });

      if (!predictRes.ok) {
        const errData = await predictRes.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to submit job");
      }

      const predictData = await predictRes.json();
      setJobId(predictData.job_id);
      setJobStatus("Pending");
      setCurrentPageToken(null);
      setPageTokenStack([]);
      setCurrentPage(1);
      fetchJobs(null);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsUploading(false);
    }
  };

  const checkStatus = async () => {
    if (!jobId) return;

    try {
      const baseUrl = API_BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/status/${jobId}`);
      if (!res.ok) throw new Error("Failed to fetch status");
      
      const data = await res.json();
      setJobStatus(data.status);
    } catch (err: any) {
      setError("Failed to check status: " + err.message);
    }
  };

  const goNext = () => {
    if (!nextPageToken) return;
    setPageTokenStack((prev) => [...prev, currentPageToken ?? ""]);
    setCurrentPageToken(nextPageToken);
    setCurrentPage((prev) => prev + 1);
    fetchJobs(nextPageToken);
  };

  const goPrev = () => {
    if (pageTokenStack.length === 0) return;
    const prevStack = [...pageTokenStack];
    const prevToken = prevStack.pop() ?? null;
    setPageTokenStack(prevStack);
    const token = prevToken === "" ? null : prevToken;
    setCurrentPageToken(token);
    setCurrentPage((prev) => Math.max(1, prev - 1));
    fetchJobs(token);
  };

  const handleRefresh = () => {
    setCurrentPageToken(null);
    setPageTokenStack([]);
    setCurrentPage(1);
    fetchJobs(null);
  };

  const handleYamlSubmit = async (yamlString: string) => {
    setIsUploading(true);
    setError(null);
    setJobId(null);
    setJobStatus(null);

    try {
      const baseUrl = API_BASE_URL.replace(/\/$/, "");

      const yamlBlob = new Blob([yamlString], { type: "application/x-yaml" });
      const yamlFile = new File([yamlBlob], "config.yaml", { type: "application/x-yaml" });
      const formData = new FormData();
      formData.append("file", yamlFile);

      const uploadRes = await fetch(`${baseUrl}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to upload YAML config");
      }

      const uploadData = await uploadRes.json();
      const configFilename = uploadData.filename;

      const predictRes = await fetch(`${baseUrl}/predict-vertex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_name: "boltz-2",
          input_file: configFilename,
          config_file: configFilename,
        }),
      });

      if (!predictRes.ok) {
        const errData = await predictRes.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to submit job");
      }

      const predictData = await predictRes.json();
      setJobId(predictData.job_id);
      setJobStatus("Pending");
      setCurrentPageToken(null);
      setPageTokenStack([]);
      setCurrentPage(1);
      fetchJobs(null);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-8">
      <header className="max-w-4xl mx-auto mb-10 text-center">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight flex justify-center items-center gap-3">
          <Activity className="text-gsk-orange w-10 h-10" />
          Boltz-2 Inference Platform
        </h1>
        <p className="mt-2 text-gray-600">Run heavy biology folding models at scale securely on Kubernetes.</p>
      </header>

      <main className="max-w-xl mx-auto space-y-8 animate-in fade-in">
        {/* Upload Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 relative">
        <h2 className="text-xl font-semibold mb-6 flex items-center justify-between">
          Submit Job
          <div className="group relative flex items-center">
            <Info className="w-5 h-5 text-gray-400 hover:text-gsk-orange cursor-pointer transition-colors" />
            
            {/* Tooltip Content */}
            <div className="absolute right-0 top-full mt-2 w-[500px] bg-gray-900 text-gray-100 text-xs rounded-xl shadow-xl p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <p className="font-semibold mb-2 text-white">Example dummy.fasta format:</p>
              <pre className="bg-gray-800 p-2 rounded whitespace-pre-wrap font-mono text-[10px] leading-tight text-gray-300">
{`>A|protein|C7F6X3|
MSLLSIITIGLAGLGGLVNGQRDLSVELGVASNFAILAKAGISSVPDSAILGDIGVSPAA
ATYITGFGLTQDSSTTYATSPQVTGLIYAADYSTPTPNYLAAAVANAETAYNQAAGFVDP
DFLELGAGELRDQTLVPGLYKWTSSVSVPTDLTFEGNGDATWVFQIAGGLSLADGVAFTL
AGGANSTNIAFQVGDDVTVGKGAHFEGVLLAKRFVTLQTGSSLNGRVLSQTEVALQKATV
NSPFVPAPEVVQKRSNARQWL`}
              </pre>
              <div className="absolute -top-1 right-2 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          </div>
        </h2>

        <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setSubmissionMode("fasta")}
            className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors ${
              submissionMode === "fasta"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Quick (FASTA)
          </button>
          <button
            onClick={() => setSubmissionMode("yaml")}
            className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors ${
              submissionMode === "yaml"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Advanced (YAML Schema)
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          {submissionMode === "fasta"
            ? "Upload a single FASTA file for quick single-sequence prediction."
            : "Configure multi-chain complexes, constraints, templates, and binding properties."}
        </p>

        {submissionMode === "fasta" && (
          <>
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-gsk-orange transition-colors">
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept=".fasta,.fa"
            onChange={handleFileChange}
          />
          <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-3">
            <UploadCloud className="w-12 h-12 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">
              {file ? file.name : "Click to upload your .fasta file"}
            </span>
          </label>
        </div>

        <button
          onClick={handleUploadAndRun}
          disabled={!file || isUploading}
          className="mt-6 w-full bg-gsk-orange hover:bg-gsk-orange-dark text-white font-semibold py-3 px-4 rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isUploading ? "Processing..." : "Run Boltz-2 Inference"}
        </button>
          </>
        )}

        {submissionMode === "yaml" && (
          <YamlConfigForm onSubmit={handleYamlSubmit} isUploading={isUploading} />
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100 flex items-start gap-2">
            <XCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Status Card */}
      {jobId && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Job Status</h2>
            <button 
              onClick={checkStatus}
              className="text-gray-500 hover:text-gsk-orange transition-colors"
              title="Refresh Status"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-gray-100">
              <span className="text-gray-500">Job ID</span>
              <span className="font-mono text-sm bg-gray-50 px-2 py-1 rounded">{jobId}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-gray-500">Status</span>
              <span className="flex items-center gap-2 font-medium">
                {jobStatus === "Pending" && <Clock className="w-4 h-4 text-yellow-500" />}
                {jobStatus === "Running" && <Activity className="w-4 h-4 text-blue-500 animate-pulse" />}
                {jobStatus === "Succeeded" && <CheckCircle className="w-4 h-4 text-green-500" />}
                {jobStatus === "Failed" && <XCircle className="w-4 h-4 text-red-500" />}
                {jobStatus}
              </span>
            </div>
            {jobStatus === "Succeeded" && (
              <button
                onClick={() => navigate(`/viewer/${jobId}`)}
                className="mt-4 w-full flex justify-center items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-medium py-3 px-4 rounded-xl shadow-sm transition-all"
              >
                <Eye className="w-5 h-5" />
                View 3D Structure
              </button>
            )}
          </div>
          </div>
      )}

      {/* Recent Jobs Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <List className="w-6 h-6 text-gsk-orange" />
            Recent Jobs
          </h2>
          <button
            onClick={handleRefresh}
            className={`text-gray-500 hover:text-gsk-orange transition-colors ${isLoadingJobs ? "animate-spin" : ""}`}
            title="Refresh List"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No jobs found.
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="py-3 px-2 font-medium">Job ID</th>
                  <th className="py-3 px-2 font-medium">Status</th>
                  <th className="py-3 px-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.job_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-2 font-mono text-xs text-gray-600 truncate max-w-[150px]" title={j.job_id}>
                      {j.job_id}
                    </td>
                    <td className="py-3 px-2">
                      <span className="flex items-center gap-1.5 font-medium text-gray-700">
                        {j.status === "Pending" && <Clock className="w-3.5 h-3.5 text-yellow-500" />}
                        {j.status === "Running" && <Activity className="w-3.5 h-3.5 text-blue-500" />}
                        {j.status === "Succeeded" && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                        {j.status === "Failed" && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right">
                      {j.status === "Succeeded" && (
                        <button
                          onClick={() => navigate(`/viewer/${j.job_id}`)}
                          className="text-gsk-orange hover:text-gsk-orange-dark font-medium flex items-center justify-end gap-1 text-xs ml-auto"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <span className="text-xs text-gray-400">
              {totalCount !== null ? `${totalCount} total jobs` : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={goPrev}
                disabled={pageTokenStack.length === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </button>
              <span className="text-xs text-gray-500 min-w-[3rem] text-center">
                Page {currentPage}
              </span>
              <button
                onClick={goNext}
                disabled={!hasMore}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          </>
        )}
        </div>
      </main>
    </div>
  );
}
