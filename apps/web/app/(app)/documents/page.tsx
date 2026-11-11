'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { CompanyLogo } from '@/components/company-logo';
import QRCode from 'qrcode';
import {
  FileText,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Printer,
  ShieldCheck,
  Building,
  Loader2,
  Calendar,
  Lock,
  X,
  Download,
} from 'lucide-react';

interface DocumentType {
  id: string;
  code: 'COE' | 'COE_COMPENSATION' | 'LEAVE_CERT' | 'PAYSLIP';
  name: string;
  description: string;
  slaDays: number;
  includesSalary: boolean;
}

interface IssuedDocument {
  id: string;
  documentNo: string;
  verificationCode: string;
  issuedAt: string;
  status: 'VALID' | 'REVOKED';
  snapshotData: any;
}

interface DocumentRequestItem {
  id: string;
  purpose: string;
  payPeriod: string | null;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  requestedAt: string;
  dueAt: string;
  rejectReason: string | null;
  documentType: DocumentType;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    position: string;
    employeeNo: string;
    department?: { name: string };
  };
  reviewedBy?: {
    firstName: string;
    lastName: string;
  };
  issuedDocument?: IssuedDocument | null;
}

function DocumentsContent() {
  const { user, can } = useAuth();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'awaiting' ? 'awaiting' : 'mine';
  const targetId = searchParams.get('id');
  const handledTargetIdRef = useRef<string | null>(null);

  const [types, setTypes] = useState<DocumentType[]>([]);
  const [requests, setRequests] = useState<DocumentRequestItem[]>([]);
  const [activeTab, setActiveTab] = useState<'mine' | 'awaiting'>(initialTab);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync tab with URL search parameter if changed
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'awaiting') {
      setActiveTab('awaiting');
    } else if (tabParam === 'mine') {
      setActiveTab('mine');
    }
  }, [searchParams]);

  // Request Form Modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [payPeriod, setPayPeriod] = useState('October 16-31, 2026');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Preview / Print Modal
  const [previewItem, setPreviewItem] = useState<DocumentRequestItem | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Decision Modal
  const [decisionItem, setDecisionItem] = useState<DocumentRequestItem | null>(null);
  const [decisionType, setDecisionType] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [decisionComment, setDecisionComment] = useState('');
  const [isDeciding, setIsDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const isHrApprover = can('document.approve');

  // URL Query Cleaner so closing modals does not re-trigger auto-open
  const clearIdFromUrl = () => {
    if (typeof window !== 'undefined' && window.location.search.includes('id=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      window.history.replaceState(
        {},
        '',
        url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : ''),
      );
    }
  };

  const handleClosePreview = () => {
    setPreviewItem(null);
    setPreviewData(null);
    setQrDataUrl('');
    clearIdFromUrl();
  };

  const handleCloseDecision = () => {
    setDecisionItem(null);
    setDecisionType(null);
    setDecisionComment('');
    setDecisionError(null);
    clearIdFromUrl();
  };

  // Keyboard shortcut: Escape exits any open document view / modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewItem) handleClosePreview();
        else if (decisionItem) handleCloseDecision();
        else if (showRequestModal) setShowRequestModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewItem, decisionItem, showRequestModal]);

  const fetchTypes = async () => {
    try {
      const data = await api<DocumentType[]>('/document-types');
      setTypes(data);
      if (data.length > 0 && !selectedTypeId) {
        setSelectedTypeId(data[0].id);
      }
    } catch (e: any) {
      console.error('Failed to load document types', e);
    }
  };

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api<DocumentRequestItem[]>(
        `/document-requests?scope=${activeTab}`,
      );
      setRequests(data);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to load requests');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTypes();
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [activeTab]);

  // If a notification links directly to a document request ID, open its modal or preview once
  useEffect(() => {
    if (!targetId || requests.length === 0) return;
    if (handledTargetIdRef.current === targetId) return;
    handledTargetIdRef.current = targetId;

    const match = requests.find((r) => r.id === targetId);
    if (match) {
      if (isHrApprover && match.status === 'PENDING_APPROVAL' && activeTab === 'awaiting') {
        setDecisionItem(match);
        setDecisionType('APPROVED');
        setDecisionComment('');
      } else {
        handleOpenPreview(match);
      }
    }
  }, [targetId, requests, isHrApprover, activeTab]);

  // Direct Print via an isolated hidden iframe for pure, clean certificate rendering
  const handleDirectPrint = () => {
    if (!previewItem) return;

    const printSheet = document.getElementById('printable-certificate-sheet');
    if (!printSheet) {
      window.print();
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    const docTitle = `${previewItem.documentType.name} - ${previewData?.documentNo || 'Official Certificate'}`;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>${docTitle}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm 20mm;
            }
            * {
              box-sizing: border-box;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            body {
              margin: 0;
              padding: 0;
              color: #171717;
              background: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
            .font-bold { font-weight: 700; }
            .font-semibold { font-weight: 600; }
            .font-black { font-weight: 900; }
            .font-medium { font-weight: 500; }
            .uppercase { text-transform: uppercase; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .text-xs { font-size: 12px; }
            .text-sm { font-size: 14px; }
            .text-lg { font-size: 18px; }
            .text-xl { font-size: 20px; }
            .text-\\[10px\\] { font-size: 10px; }
            .text-\\[11px\\] { font-size: 11px; }
            .text-\\[9px\\] { font-size: 9px; }
            .border-b { border-bottom: 1px solid #e5e5e5; }
            .border-b-2 { border-bottom: 2px solid #171717; }
            .border-t { border-top: 1px solid #e5e5e5; }
            .border { border: 1px solid #e5e5e5; }
            .rounded { border-radius: 6px; }
            .p-4 { padding: 16px; }
            .p-8 { padding: 24px; }
            .pb-1 { padding-bottom: 4px; }
            .pb-6 { padding-bottom: 20px; }
            .pt-1 { padding-top: 4px; }
            .pt-2 { padding-top: 8px; }
            .pt-10 { padding-top: 32px; }
            .py-1 { padding-top: 4px; padding-bottom: 4px; }
            .py-4 { padding-top: 14px; padding-bottom: 14px; }
            .py-6 { padding-top: 20px; padding-bottom: 20px; }
            .w-full { width: 100%; }
            .w-20 { width: 80px; }
            .h-20 { height: 80px; }
            .w-48 { width: 192px; }
            .space-y-1 > * + * { margin-top: 4px; }
            .space-y-2 > * + * { margin-top: 8px; }
            .space-y-4 > * + * { margin-top: 14px; }
            .flex { display: flex; }
            .flex-col { flex-direction: column; }
            .justify-between { justify-content: space-between; }
            .items-center { align-items: center; }
            .items-end { align-items: flex-end; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 6px 8px; font-size: 12px; }
            .bg-neutral-50 { background-color: #fafafa; }
            .text-neutral-500 { color: #737373; }
            .text-neutral-600 { color: #525252; }
            .text-neutral-900 { color: #171717; }
            .underline { text-decoration: underline; }
            .underline-offset-8 { text-underline-offset: 8px; }
            .no-print { display: none !important; }
          </style>
        </head>
        <body>
          <div style="padding: 10px 15px;">
            ${printSheet.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 2000);
    }, 250);
  };

  // Direct Save / Download of official self-contained document file (.html)
  const handleDownloadFile = () => {
    if (!previewItem) return;
    const printSheet = document.getElementById('printable-certificate-sheet');
    if (!printSheet) return;

    const docNo = previewData?.documentNo || 'DRAFT';
    const cleanDocNo = docNo.replace(/[^a-zA-Z0-9-]/g, '_');
    const filename = `${previewItem.documentType.code}_${cleanDocNo}.html`;

    const docTitle = `${previewItem.documentType.name} - ${previewData?.documentNo || 'Official Certificate'}`;

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${docTitle}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm 20mm; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { margin: 0; padding: 40px 20px; background: #f3f4f6; color: #171717; display: flex; justify-content: center; }
    .sheet-wrapper { background: #ffffff; width: 100%; max-width: 800px; padding: 48px; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    @media print { body { background: white; padding: 0; } .sheet-wrapper { border: none; box-shadow: none; padding: 0; } }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .font-black { font-weight: 900; }
    .font-medium { font-weight: 500; }
    .uppercase { text-transform: uppercase; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-xs { font-size: 12px; }
    .text-sm { font-size: 14px; }
    .text-lg { font-size: 18px; }
    .text-xl { font-size: 20px; }
    .text-\\[10px\\] { font-size: 10px; }
    .text-\\[11px\\] { font-size: 11px; }
    .text-\\[9px\\] { font-size: 9px; }
    .border-b { border-bottom: 1px solid #e5e5e5; }
    .border-b-2 { border-bottom: 2px solid #171717; }
    .border-t { border-top: 1px solid #e5e5e5; }
    .border { border: 1px solid #e5e5e5; }
    .rounded { border-radius: 6px; }
    .p-4 { padding: 16px; }
    .p-8 { padding: 24px; }
    .pb-1 { padding-bottom: 4px; }
    .pb-6 { padding-bottom: 20px; }
    .pt-1 { padding-top: 4px; }
    .pt-2 { padding-top: 8px; }
    .pt-10 { padding-top: 32px; }
    .py-1 { padding-top: 4px; padding-bottom: 4px; }
    .py-4 { padding-top: 14px; padding-bottom: 14px; }
    .py-6 { padding-top: 20px; padding-bottom: 20px; }
    .w-full { width: 100%; }
    .w-20 { width: 80px; }
    .h-20 { height: 80px; }
    .w-48 { width: 192px; }
    .space-y-1 > * + * { margin-top: 4px; }
    .space-y-2 > * + * { margin-top: 8px; }
    .space-y-4 > * + * { margin-top: 14px; }
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .justify-between { justify-content: space-between; }
    .items-center { align-items: center; }
    .items-end { align-items: flex-end; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 8px; font-size: 12px; }
    .bg-neutral-50 { background-color: #fafafa; }
    .text-neutral-500 { color: #737373; }
    .text-neutral-600 { color: #525252; }
    .text-neutral-900 { color: #171717; }
    .underline { text-decoration: underline; }
    .underline-offset-8 { text-underline-offset: 8px; }
  </style>
</head>
<body>
  <div class="sheet-wrapper">
    ${printSheet.innerHTML}
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenPreview = async (item: DocumentRequestItem) => {
    setPreviewItem(item);
    setIsLoadingPreview(true);
    setQrDataUrl('');
    try {
      const data = await api<any>(`/document-requests/${item.id}/preview`);
      setPreviewData(data);

      const code = data.verificationCode || 'DRAFT-PREVIEW';
      const verifyUrl = `${window.location.origin}/verify/${code}`;
      const url = await QRCode.toDataURL(verifyUrl, { width: 120, margin: 1 });
      setQrDataUrl(url);
    } catch (err: any) {
      alert('Failed to load document preview');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const docType = types.find((t) => t.id === selectedTypeId);
    if (!docType) return;

    try {
      setIsSubmitting(true);
      await api('/document-requests', {
        method: 'POST',
        body: JSON.stringify({
          documentTypeId: selectedTypeId,
          purpose: purpose.trim(),
          payPeriod: docType.code === 'PAYSLIP' ? payPeriod : undefined,
        }),
      });

      setShowRequestModal(false);
      setPurpose('');
      await fetchRequests();
    } catch (err: any) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionItem || !decisionType) return;
    setDecisionError(null);

    if (decisionType === 'REJECTED' && !decisionComment.trim()) {
      setDecisionError('A reason is required to reject this document request.');
      return;
    }

    try {
      setIsDeciding(true);
      await api(`/document-requests/${decisionItem.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision: decisionType,
          comment: decisionComment.trim() || undefined,
        }),
      });

      setDecisionItem(null);
      setDecisionType(null);
      setDecisionComment('');
      await fetchRequests();
    } catch (err: any) {
      setDecisionError(err instanceof ApiError ? err.message : 'Failed to record decision');
    } finally {
      setIsDeciding(false);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getSlaBadge = (dueAt: string, status: string) => {
    if (status !== 'PENDING_APPROVAL') return null;
    const now = new Date().getTime();
    const due = new Date(dueAt).getTime();
    const diffHours = Math.round((due - now) / (1000 * 60 * 60));

    if (diffHours < 0) {
      const daysOver = Math.abs(Math.round(diffHours / 24));
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
          <AlertCircle className="w-3 h-3" /> Overdue ({daysOver}d)
        </span>
      );
    }
    if (diffHours <= 24) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <Clock className="w-3 h-3" /> Due in {diffHours}h (DOLE SLA)
        </span>
      );
    }
    const days = Math.ceil(diffHours / 24);
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
        <Clock className="w-3 h-3" /> {days} working days left
      </span>
    );
  };

  const selectedType = types.find((t) => t.id === selectedTypeId);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Document Requests</h1>
            {!isLoading && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                {requests.length} total
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Request official Certificates of Employment, Leave Statements, and Payslips. Compliant with DOLE 3-day SLA issuance guidelines.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* HR Tabs */}
          {isHrApprover && (
            <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <button
                onClick={() => setActiveTab('mine')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  activeTab === 'mine'
                    ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                My Requests
              </button>
              <button
                onClick={() => setActiveTab('awaiting')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  activeTab === 'awaiting'
                    ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                HR Approval Queue
              </button>
            </div>
          )}

          <button
            onClick={() => setShowRequestModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Request Document
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-neutral-900 dark:text-neutral-100 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">
              Error loading document requests
            </div>
            <div className="text-neutral-600 dark:text-neutral-400 text-xs mt-0.5">
              {error}
            </div>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-neutral-500">
            <Loader2 className="w-6 h-6 animate-spin mb-3" />
            <p className="text-sm">Loading requests...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <FileText className="w-10 h-10 mx-auto mb-3 text-neutral-400" />
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              No Document Requests
            </h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
              {activeTab === 'awaiting'
                ? 'There are currently no document requests awaiting HR review.'
                : 'You have not submitted any document requests yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Document Type</th>
                  <th className="px-5 py-3">Requester</th>
                  <th className="px-5 py-3">Purpose</th>
                  <th className="px-5 py-3">SLA Status</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {requests.map((item) => {
                  const isPending = item.status === 'PENDING_APPROVAL';
                  const isApproved = item.status === 'APPROVED';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                    >
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                          {item.documentType.name}
                        </div>
                        {item.issuedDocument && (
                          <div className="text-xs font-mono text-neutral-500 mt-0.5">
                            {item.issuedDocument.documentNo}
                          </div>
                        )}
                        {item.payPeriod && (
                          <div className="text-xs text-neutral-500 mt-0.5">
                            Period: {item.payPeriod}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">
                          {item.employee.firstName} {item.employee.lastName}
                        </div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {item.employee.position} • {item.employee.employeeNo}
                        </div>
                      </td>

                      <td className="px-5 py-4 max-w-xs text-neutral-600 dark:text-neutral-400">
                        <div className="truncate text-xs" title={item.purpose}>
                          "{item.purpose}"
                        </div>
                        <div className="text-[11px] text-neutral-400 mt-0.5">
                          Requested {formatDate(item.requestedAt)}
                        </div>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        {getSlaBadge(item.dueAt, item.status) || (
                          <span className="text-xs text-neutral-400">
                            {isApproved ? 'Completed' : 'Concluded'}
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        {item.status === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle className="w-3 h-3" /> Released
                          </span>
                        ) : item.status === 'PENDING_APPROVAL' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <Clock className="w-3 h-3" /> Pending Review
                          </span>
                        ) : item.status === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            <XCircle className="w-3 h-3" /> Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
                            Cancelled
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => handleOpenPreview(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {isApproved ? 'View / Print' : 'Draft Preview'}
                          </button>

                          {activeTab === 'awaiting' && isPending && isHrApprover && (
                            <>
                              <button
                                onClick={() => {
                                  setDecisionItem(item);
                                  setDecisionType('REJECTED');
                                  setDecisionComment('');
                                  setDecisionError(null);
                                }}
                                className="px-2.5 py-1 text-xs font-medium rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => {
                                  setDecisionItem(item);
                                  setDecisionType('APPROVED');
                                  setDecisionComment('');
                                  setDecisionError(null);
                                }}
                                className="px-2.5 py-1 text-xs font-semibold rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
                              >
                                Certify & Issue
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowRequestModal(false);
          }}
        >
          <form
            onSubmit={handleFileSubmit}
            className="max-w-md w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-xl relative"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                  Request Official Document
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Select the certificate you need. A watermarked preview will be generated immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitError && (
              <div className="p-2.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Document Type *
              </label>
              <select
                value={selectedTypeId}
                onChange={(e) => setSelectedTypeId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                required
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {selectedType && (
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  {selectedType.description}
                </p>
              )}
            </div>

            {selectedType?.code === 'PAYSLIP' && (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Pay Period *
                </label>
                <input
                  type="text"
                  value={payPeriod}
                  onChange={(e) => setPayPeriod(e.target.value)}
                  placeholder="e.g. October 16-31, 2026"
                  className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                  required
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Purpose of Request *
              </label>
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                rows={3}
                placeholder="e.g. Visa application requirement for embassy / Bank personal loan..."
                className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                required
              />
            </div>

            <div className="p-3 text-[11px] rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">DOLE Compliance Notice:</span> In compliance with DOLE Labor Advisory No. 06 (Series of 2020), official Certificates of Employment are processed and released within three (3) working days.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Submit Request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Decision Modal */}
      {decisionType && decisionItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseDecision();
          }}
        >
          <form
            onSubmit={handleDecisionSubmit}
            className="max-w-md w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-xl relative"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                  {decisionType === 'APPROVED' ? 'Certify & Issue Document' : 'Reject Document Request'}
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  {decisionItem.employee.firstName} {decisionItem.employee.lastName} • {decisionItem.documentType.name}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseDecision}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {decisionError && (
              <div className="p-2.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{decisionError}</span>
              </div>
            )}

            {decisionType === 'APPROVED' ? (
              <div className="p-3 text-xs rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 space-y-1">
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Approval & Certification Actions:
                </p>
                <ul className="list-disc list-inside text-[11px] space-y-0.5">
                  <li>Removes draft watermark and unlocks official certificate.</li>
                  <li>Generates sequential document serial number and secure QR verification code.</li>
                  <li>Attaches digital HR stamp and notifies employee immediately.</li>
                </ul>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Reason for Rejection *
                </label>
                <textarea
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  rows={3}
                  placeholder="State reason why this request cannot be certified..."
                  className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                  required
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCloseDecision}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isDeciding}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50"
              >
                {isDeciding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm {decisionType === 'APPROVED' ? 'Certification' : 'Rejection'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Printable Sheet & Preview Drawer */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto print-modal-backdrop no-print:not-target"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClosePreview();
          }}
        >
          <div className="max-w-3xl w-full my-auto bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col print-modal-container max-h-[92vh]">
            {/* Top Sticky Toolbar */}
            <div className="p-3.5 sm:p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-950 no-print shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                  {previewData?.isDraft ? 'Draft Certificate Preview' : 'Official Certified Document'}
                </span>
                {previewData?.isDraft ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    WATERMARKED DRAFT
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> OFFICIAL & CERTIFIED
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDirectPrint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors shadow-xs cursor-pointer"
                  title="Print document or Save as PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadFile}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
                  title="Download self-contained offline document file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Save File</span>
                </button>
                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
                  title="Exit Document View (or press Escape)"
                >
                  <X className="w-4 h-4" />
                  <span>Exit View</span>
                  <span className="hidden sm:inline text-[10px] text-neutral-400 font-mono ml-0.5">[Esc]</span>
                </button>
              </div>
            </div>

            {/* Scrollable Document Area */}
            <div className="flex-1 overflow-y-auto bg-neutral-100 dark:bg-neutral-950/40 p-3 sm:p-8 flex justify-center">
              <div
                id="printable-certificate-sheet"
                className="w-full max-w-2xl bg-white text-neutral-900 p-8 sm:p-12 relative shadow-lg rounded-xl printable-certificate border border-neutral-200/80 min-h-[500px]"
              >
                {/* Draft Watermark Overlay */}
                {previewData?.isDraft && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 select-none">
                    <div className="text-red-500/15 font-black text-5xl md:text-6xl -rotate-45 transform text-center uppercase tracking-widest border-4 border-dashed border-red-500/20 p-8 rounded-2xl">
                      DRAFT PREVIEW<br />
                      <span className="text-xl">NOT VALID FOR OFFICIAL USE</span>
                    </div>
                  </div>
                )}

                {/* Letterhead */}
                <div className="text-center pb-6 border-b-2 border-neutral-900 space-y-1">
                  <div className="flex items-center justify-center gap-2">
                    <CompanyLogo variant="mark" className="h-8 w-auto text-neutral-900" />
                    <span className="font-black text-xl tracking-tight text-neutral-900 uppercase">
                      Azir Company Global Tech
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 font-medium">
                    Human Resources Administration & Enterprise People Operations
                  </p>
                  <p className="text-[10px] text-neutral-500">
                    Manila, Philippines • inquiries@azircompany.test • www.azircompany.test
                  </p>
                </div>

                {/* Document Number & Date */}
                <div className="flex items-center justify-between text-xs text-neutral-600 py-6">
                  <div>
                    <span className="font-bold text-neutral-900">Document No: </span>
                    <span className="font-mono">{previewData?.documentNo || 'DRAFT-PREVIEW'}</span>
                  </div>
                  <div>
                    <span className="font-bold text-neutral-900">Date: </span>
                    <span>{formatDate(previewData?.issuedAt || previewData?.requestedAt || new Date().toISOString())}</span>
                  </div>
                </div>

                {/* Certificate Title */}
                <div className="text-center py-4">
                  <h2 className="text-lg font-black uppercase tracking-wider text-neutral-900 underline underline-offset-8">
                    {previewItem.documentType.name}
                  </h2>
                </div>

                {/* Certificate Content */}
                <div className="py-6 text-sm text-neutral-800 leading-relaxed space-y-4">
                  <p className="font-bold">TO WHOM IT MAY CONCERN:</p>

                  {previewItem.documentType.code === 'COE' && (
                    <p>
                      This is to certify that <strong className="uppercase">{previewData?.employee?.firstName} {previewData?.employee?.lastName}</strong> (Employee No. <span className="font-mono">{previewData?.employee?.employeeNo}</span>) is currently employed with <strong>Azir Company Global Tech</strong> as <strong>{previewData?.employee?.position}</strong> in the <strong>{previewData?.employee?.department || 'General'}</strong> department, having commenced employment on <strong>{formatDate(previewData?.employee?.hireDate)}</strong>.
                    </p>
                  )}

                  {previewItem.documentType.code === 'COE_COMPENSATION' && (
                    <>
                      <p>
                        This certifies that <strong className="uppercase">{previewData?.employee?.firstName} {previewData?.employee?.lastName}</strong> is an active employee of <strong>Azir Company Global Tech</strong> serving as <strong>{previewData?.employee?.position}</strong> since <strong>{formatDate(previewData?.employee?.hireDate)}</strong>.
                      </p>
                      <div className="p-4 rounded border border-neutral-300 bg-neutral-50 space-y-2 text-xs">
                        <div className="font-bold text-neutral-900 border-b pb-1">COMPENSATION DETAILS:</div>
                        <div className="flex justify-between">
                          <span>Basic Monthly Salary:</span>
                          <span className="font-mono font-semibold">₱ 45,000.00</span>
                        </div>
                        <div className="flex justify-between">
                          <span>De Minimis / Allowances:</span>
                          <span className="font-mono font-semibold">₱ 5,000.00</span>
                        </div>
                        <div className="flex justify-between border-t pt-1 font-bold">
                          <span>Gross Monthly Pay:</span>
                          <span className="font-mono">₱ 50,000.00</span>
                        </div>
                      </div>
                    </>
                  )}

                  {previewItem.documentType.code === 'LEAVE_CERT' && (
                    <>
                      <p>
                        This official certificate verifies the current leave credit standing of <strong className="uppercase">{previewData?.employee?.firstName} {previewData?.employee?.lastName}</strong> as of this calendar year:
                      </p>
                      <div className="p-4 rounded border border-neutral-300 bg-neutral-50 text-xs">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b font-semibold">
                              <th className="pb-1">Leave Type</th>
                              <th className="pb-1 text-center">Granted</th>
                              <th className="pb-1 text-center">Used</th>
                              <th className="pb-1 text-right">Available Balance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(previewData?.balances || []).map((b: any) => (
                              <tr key={b.code}>
                                <td className="py-1 font-medium">{b.name}</td>
                                <td className="py-1 text-center font-mono">{b.balance + b.used}d</td>
                                <td className="py-1 text-center font-mono">{b.used}d</td>
                                <td className="py-1 text-right font-mono font-bold">{b.available}d</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {previewItem.documentType.code === 'PAYSLIP' && (
                    <>
                      <p>
                        This document serves as the certified official payslip breakdown for <strong className="uppercase">{previewData?.employee?.firstName} {previewData?.employee?.lastName}</strong> for the cutoff period <strong>{previewItem.payPeriod || 'Current Period'}</strong>:
                      </p>
                      <div className="p-4 rounded border border-neutral-300 bg-neutral-50 text-xs space-y-2">
                        <div className="flex justify-between font-bold border-b pb-1">
                          <span>EARNINGS & BASIC PAY:</span>
                          <span className="font-mono">₱ 25,000.00</span>
                        </div>
                        <div className="flex justify-between text-neutral-600">
                          <span>SSS / PhilHealth / Pag-IBIG:</span>
                          <span className="font-mono">-₱ 2,150.00</span>
                        </div>
                        <div className="flex justify-between text-neutral-600">
                          <span>BIR Withholding Tax:</span>
                          <span className="font-mono">-₱ 1,850.00</span>
                        </div>
                        <div className="flex justify-between font-bold text-neutral-900 border-t pt-1">
                          <span>NET TAKE HOME PAY:</span>
                          <span className="font-mono text-sm">₱ 21,000.00</span>
                        </div>
                      </div>
                    </>
                  )}

                  <p className="pt-2">
                    This certification is issued upon the request of the above-named employee for the purpose of <strong>"{previewItem.purpose}"</strong>.
                  </p>
                </div>

                {/* Signatures & QR Section */}
                <div className="pt-10 flex items-end justify-between border-t border-neutral-200">
                  <div className="space-y-2">
                    <div className="font-bold text-xs uppercase tracking-wider text-neutral-900">
                      Certified by:
                    </div>
                    <div className="w-48 border-b border-neutral-900 pb-1 font-semibold text-xs">
                      {previewData?.reviewedBy ? `${previewData.reviewedBy.firstName} ${previewData.reviewedBy.lastName}` : 'Human Resources Dept.'}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      People & Culture Division • Azir Company
                    </div>
                  </div>

                  {/* QR Code */}
                  {qrDataUrl && (
                    <div className="flex flex-col items-center text-center">
                      <img src={qrDataUrl} alt="Document Verification QR" className="w-20 h-20 border rounded p-1 bg-white" />
                      <span className="text-[9px] font-mono text-neutral-500 mt-1">Scan to Verify Authenticity</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Sticky Action Bar */}
            <div className="p-3 sm:p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 flex items-center justify-between no-print shrink-0">
              <div className="text-[11px] text-neutral-500 hidden md:block">
                {previewData?.isDraft
                  ? 'Draft preview mode. Official verification code & legal serial stamp unlock upon HR approval.'
                  : 'Official Azir Company record. Scan QR code or visit /verify to validate authenticity.'}
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleDirectPrint}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={handleDownloadFile}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Save File
                </button>
                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-bold rounded-lg bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  Exit View
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-neutral-500">Loading documents...</p>
        </div>
      }
    >
      <DocumentsContent />
    </Suspense>
  );
}
