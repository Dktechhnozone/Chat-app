import React from "react";
import { FileText, FileImage, Download, ExternalLink } from "lucide-react";

interface FilePreviewProps {
  fileUrl: string;
  fileName: string;
  fileType?: string;
  isCurrentUser: boolean;
}

export default function FilePreview({ fileUrl, fileName, fileType, isCurrentUser }: FilePreviewProps) {
  const isImage = fileType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName);

  if (isImage) {
    return (
      <div id={`file-preview-${fileName}`} className="mt-2 rounded-lg overflow-hidden border border-slate-700 max-w-sm bg-slate-900/50">
        <img
          src={fileUrl}
          alt={fileName}
          className="max-h-64 object-contain w-full hover:opacity-90 transition-opacity cursor-pointer"
          onClick={() => window.open(fileUrl, "_blank")}
          referrerPolicy="no-referrer"
        />
        <div className="p-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-700 bg-slate-900/35">
          <span className="truncate max-w-[200px]" title={fileName}>{fileName}</span>
          <a
            href={fileUrl}
            download={fileName}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      id={`file-doc-preview-${fileName}`}
      className={`mt-2 flex items-center justify-between p-3 rounded-xl border max-w-sm ${
        isCurrentUser
          ? "bg-slate-900/30 border-indigo-400/30 text-white"
          : "bg-slate-800 border-slate-700 text-slate-100"
      }`}
    >
      <div className="flex items-center space-x-3 truncate">
        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
          <FileText className="w-6 h-6" />
        </div>
        <div className="truncate text-left">
          <p className="text-sm font-medium truncate" title={fileName}>{fileName}</p>
          <p className="text-xs text-slate-400 truncate">
            {fileType ? fileType.split("/")[1]?.toUpperCase() || "File" : "Attachment"}
          </p>
        </div>
      </div>
      <a
        href={fileUrl}
        download={fileName}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors shrink-0"
        title="Download File"
      >
        <Download className="w-4 h-4" />
      </a>
    </div>
  );
}
